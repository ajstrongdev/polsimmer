import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  executiveOrders,
  executiveOrderEffects,
  executiveOrderPolicyEffects,
  executiveOrderAssessments,
  nationChanges,
  nationPolicyValues,
  nationStatValues,
  nations,
  users,
} from "@/db/schema";
import { requireAuthMiddleware, authMiddleware } from "@/middleware/auth";
import { getCurrentDatabaseUser } from "@/lib/server/auth/current-user";
import { applyDiminishingEffect } from "@/lib/nation/simulation";
import {
  DAILY_ORDER_LIMIT,
  canIssueOrder,
  reversal,
  policyAfterCancellation,
  validateOrder,
  validateOrderAssessment,
  aggregateOrderAssessments,
} from "@/lib/nation/executive-orders";
import { updateNationHeadlines } from "@/lib/server/bills/bill-effects";
import { POLICY_BY_KEY, STAT_BY_KEY } from "@/lib/nation/catalog";
import { BASE_BILL_STAGE_MS } from "@/lib/game-speed";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function settleDueExecutiveOrders(tx: Transaction, now: Date) {
  const due = await tx
    .select()
    .from(executiveOrders)
    .where(
      and(
        isNull(executiveOrders.enactedAt),
        isNull(executiveOrders.cancelledAt),
        lte(executiveOrders.committeeEndsAt, sql`clock_timestamp()::timestamp`),
      ),
    );
  if (!due.length) return;
  const [nation] = await tx.select({ id: nations.id }).from(nations).limit(1);
  if (!nation) throw new Error("Nation state is not configured");
  await tx.execute(
    sql`select ${nations.id} from ${nations} where ${nations.id} = ${nation.id} for update`,
  );
  for (const candidate of due) {
    const [order] = await tx
      .select()
      .from(executiveOrders)
      .where(eq(executiveOrders.id, candidate.id))
      .limit(1);
    if (!order || order.cancelledAt || order.enactedAt) continue;
    const assessments = await tx
      .select({ effects: executiveOrderAssessments.effects })
      .from(executiveOrderAssessments)
      .where(eq(executiveOrderAssessments.orderId, order.id));
    for (const { statKey, effect } of aggregateOrderAssessments(
      assessments.map((item) => item.effects),
    )) {
      const [current] = await tx
        .select()
        .from(nationStatValues)
        .where(
          and(
            eq(nationStatValues.nationId, nation.id),
            eq(nationStatValues.statKey, statKey),
          ),
        )
        .limit(1);
      const definition = STAT_BY_KEY.get(statKey);
      if (!current || !definition)
        throw new Error("Statistic is not configured");
      const next = applyDiminishingEffect(
        current.value,
        effect,
        definition.min,
        definition.max,
      );
      await tx.insert(executiveOrderEffects).values({
        orderId: order.id,
        statKey,
        effect,
        appliedChange: next - current.value,
      });
      if (next !== current.value) {
        await tx
          .update(nationStatValues)
          .set({ value: next, updatedAt: now })
          .where(
            and(
              eq(nationStatValues.nationId, nation.id),
              eq(nationStatValues.statKey, statKey),
            ),
          );
        await tx.insert(nationChanges).values({
          nationId: nation.id,
          executiveOrderId: order.id,
          kind: "stat",
          key: statKey,
          previousValue: current.value,
          newValue: next,
        });
      }
    }
    await tx
      .update(executiveOrders)
      .set({ enactedAt: now })
      .where(eq(executiveOrders.id, order.id));
  }
  await updateNationHeadlines(tx, nation.id);
}

export const getExecutiveOrders = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await db.transaction((tx) => settleDueExecutiveOrders(tx, new Date()));
    const user = context.user
      ? await getCurrentDatabaseUser(context.user)
      : null;
    const [orders, effects, policies, assessments, issuedRecently] =
      await Promise.all([
        db
          .select({ order: executiveOrders, president: users.username })
          .from(executiveOrders)
          .innerJoin(users, eq(users.id, executiveOrders.presidentId))
          .orderBy(desc(executiveOrders.createdAt), desc(executiveOrders.id)),
        db.select().from(executiveOrderEffects),
        db.select().from(executiveOrderPolicyEffects),
        db.select().from(executiveOrderAssessments),
        db
          .select({
            count: sql<number>`count(*)::int`,
            resetAt: sql<Date | null>`min(${executiveOrders.createdAt}) + interval '24 hours'`,
          })
          .from(executiveOrders)
          .where(
            sql`${executiveOrders.createdAt} > clock_timestamp()::timestamp - interval '24 hours'`,
          ),
      ]);
    // ponytail: scans all assessments; aggregate in SQL if order volume grows.
    return {
      orders: orders.map(({ order, president }) => ({
        ...order,
        president,
        effects: (() => {
          const enacted = effects.filter(
            (effect) => effect.orderId === order.id,
          );
          if (enacted.length)
            return enacted.map((effect) => ({
              statKey: effect.statKey,
              name: STAT_BY_KEY.get(effect.statKey)?.name ?? effect.statKey,
              effect: effect.effect,
            }));
          if (order.cancelledAt || order.enactedAt) return [];
          return aggregateOrderAssessments(
            assessments
              .filter((item) => item.orderId === order.id)
              .map((item) => item.effects),
          ).map(({ statKey, effect }) => ({
            statKey,
            name: STAT_BY_KEY.get(statKey)?.name ?? statKey,
            effect,
          }));
        })(),
        policy: (() => {
          const policy = policies.find((item) => item.orderId === order.id);
          return policy
            ? {
                ...policy,
                name:
                  POLICY_BY_KEY.get(policy.policyKey)?.name ?? policy.policyKey,
              }
            : null;
        })(),
        assessmentCount: assessments.filter((item) => item.orderId === order.id)
          .length,
        ownAssessment:
          assessments.find(
            (item) => item.orderId === order.id && item.senatorId === user?.id,
          )?.effects ?? null,
      })),
      ordersRemaining: Math.max(0, DAILY_ORDER_LIMIT - issuedRecently[0].count),
      nextResetAt: issuedRecently[0].resetAt,
      role: user?.isActive ? user.role : null,
    };
  });

export const issueExecutiveOrder = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ title: z.string(), description: z.string() }))
  .handler(async ({ data, context }) => {
    validateOrder(data.title, data.description);
    if (!context.user) throw new Error("Authentication required");
    const user = await getCurrentDatabaseUser(context.user);
    if (user?.role !== "President" || !user.isActive)
      throw new Error("Only the serving president can issue orders");
    await db.transaction(async (tx) => {
      const [nation] = await tx
        .select({ id: nations.id })
        .from(nations)
        .limit(1);
      if (!nation) throw new Error("Nation state is not configured");
      await tx.execute(
        sql`select ${nations.id} from ${nations} where ${nations.id} = ${nation.id} for update`,
      );
      const [issued] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(executiveOrders)
        .where(
          sql`${executiveOrders.createdAt} > clock_timestamp()::timestamp - interval '24 hours'`,
        );
      if (!canIssueOrder(issued.count))
        throw new Error(
          `The president can issue only ${DAILY_ORDER_LIMIT} orders per 24 hours`,
        );
      await tx.insert(executiveOrders).values({
        presidentId: user.id,
        title: data.title.trim(),
        description: data.description.trim(),
        createdAt: sql`clock_timestamp()::timestamp`,
        committeeEndsAt: sql`clock_timestamp()::timestamp + ${BASE_BILL_STAGE_MS} * interval '1 millisecond'`,
      });
    });
    return { success: true };
  });

export const cancelExecutiveOrder = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ orderId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    if (!context.user) throw new Error("Authentication required");
    const user = await getCurrentDatabaseUser(context.user);
    if (user?.role !== "President" || !user.isActive)
      throw new Error("Only the serving president can cancel orders");
    return db.transaction(async (tx) => {
      const [nation] = await tx
        .select({ id: nations.id })
        .from(nations)
        .limit(1);
      if (!nation) throw new Error("Nation state is not configured");
      await tx.execute(
        sql`select ${nations.id} from ${nations} where ${nations.id} = ${nation.id} for update`,
      );
      const [order] = await tx
        .select()
        .from(executiveOrders)
        .where(eq(executiveOrders.id, data.orderId))
        .limit(1);
      if (!order || order.cancelledAt)
        throw new Error("This order is no longer in force");
      await tx
        .update(executiveOrders)
        .set({ cancelledAt: new Date() })
        .where(eq(executiveOrders.id, order.id));
      const effects = await tx
        .select()
        .from(executiveOrderEffects)
        .where(eq(executiveOrderEffects.orderId, order.id));
      for (const effect of effects) {
        const [stat] = await tx
          .select()
          .from(nationStatValues)
          .where(
            and(
              eq(nationStatValues.nationId, nation.id),
              eq(nationStatValues.statKey, effect.statKey),
            ),
          )
          .limit(1);
        if (!stat) throw new Error("Statistic is not configured");
        const next = reversal(stat.value, effect.appliedChange);
        await tx
          .update(nationStatValues)
          .set({ value: next, updatedAt: new Date() })
          .where(
            and(
              eq(nationStatValues.nationId, nation.id),
              eq(nationStatValues.statKey, effect.statKey),
            ),
          );
        await tx.insert(nationChanges).values({
          nationId: nation.id,
          executiveOrderId: order.id,
          kind: "stat_cancellation",
          key: effect.statKey,
          previousValue: stat.value,
          newValue: next,
        });
      }
      const [policy] = await tx
        .select()
        .from(executiveOrderPolicyEffects)
        .where(eq(executiveOrderPolicyEffects.orderId, order.id))
        .limit(1);
      if (policy) {
        // ponytail: replay this policy's history on cancellation; snapshot if this ever becomes hot.
        const changes = await tx
          .select({
            executiveOrderId: nationChanges.executiveOrderId,
            cancelledAt: executiveOrders.cancelledAt,
            previousValue: nationChanges.previousValue,
            newValue: nationChanges.newValue,
          })
          .from(nationChanges)
          .leftJoin(
            executiveOrders,
            eq(nationChanges.executiveOrderId, executiveOrders.id),
          )
          .where(
            and(
              eq(nationChanges.nationId, nation.id),
              eq(nationChanges.kind, "policy"),
              eq(nationChanges.key, policy.policyKey),
            ),
          )
          .orderBy(asc(nationChanges.id));
        const next = policyAfterCancellation(changes);
        const [current] = await tx
          .select()
          .from(nationPolicyValues)
          .where(
            and(
              eq(nationPolicyValues.nationId, nation.id),
              eq(nationPolicyValues.policyKey, policy.policyKey),
            ),
          )
          .limit(1);
        if (!current) throw new Error("Policy is not configured");
        if (current.value !== next) {
          await tx
            .update(nationPolicyValues)
            .set({ value: next, updatedAt: new Date() })
            .where(
              and(
                eq(nationPolicyValues.nationId, nation.id),
                eq(nationPolicyValues.policyKey, policy.policyKey),
              ),
            );
          await tx.insert(nationChanges).values({
            nationId: nation.id,
            executiveOrderId: order.id,
            kind: "policy_cancellation",
            key: policy.policyKey,
            previousValue: current.value,
            newValue: next,
          });
        }
      }
      await updateNationHeadlines(tx, nation.id);
      return { cancelled: true };
    });
  });

export const assessExecutiveOrder = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      orderId: z.number().int().positive(),
      effects: z.array(z.object({ statKey: z.string(), effect: z.number() })),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user) throw new Error("Authentication required");
    const user = await getCurrentDatabaseUser(context.user);
    if (user?.role !== "Senator" || !user.isActive)
      throw new Error("Only serving senators can assess orders");
    return db.transaction(async (tx) => {
      const [nation] = await tx
        .select({ id: nations.id })
        .from(nations)
        .limit(1);
      if (!nation) throw new Error("Nation state is not configured");
      await tx.execute(
        sql`select ${nations.id} from ${nations} where ${nations.id} = ${nation.id} for update`,
      );
      const [order] = await tx
        .select()
        .from(executiveOrders)
        .where(
          and(
            eq(executiveOrders.id, data.orderId),
            sql`${executiveOrders.committeeEndsAt} > clock_timestamp()::timestamp`,
          ),
        )
        .limit(1);
      if (
        !order ||
        order.cancelledAt ||
        order.enactedAt ||
        !order.committeeEndsAt
      )
        throw new Error("The committee period for this order has closed");
      validateOrderAssessment(data.effects);
      await tx
        .insert(executiveOrderAssessments)
        .values({
          orderId: order.id,
          senatorId: user.id,
          effects: data.effects,
        })
        .onConflictDoUpdate({
          target: [
            executiveOrderAssessments.orderId,
            executiveOrderAssessments.senatorId,
          ],
          set: { effects: data.effects, updatedAt: new Date() },
        });
      return { success: true };
    });
  });
