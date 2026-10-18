import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  executiveOrders,
  nationChanges,
  nationPolicyDefinitions,
  nationPolicyValues,
  nationStatDefinitions,
  nationStatValues,
  nations,
} from "@/db/schema";
import { FIXED_POLICY_VALUES, STAT_DEFINITIONS } from "@/lib/nation/catalog";
import { buildNationHistory } from "@/lib/nation/history";

export const getNationOverview = createServerFn().handler(async () => {
  const [nation] = await db.select().from(nations).limit(1);
  if (!nation) return null;
  const [stats, policies, recentChanges, allChanges] = await Promise.all([
    db
      .select({
        key: nationStatDefinitions.key,
        name: nationStatDefinitions.name,
        category: nationStatDefinitions.category,
        value: nationStatValues.value,
      })
      .from(nationStatValues)
      .innerJoin(
        nationStatDefinitions,
        eq(nationStatValues.statKey, nationStatDefinitions.key),
      )
      .where(eq(nationStatValues.nationId, nation.id))
      .orderBy(nationStatDefinitions.category, nationStatDefinitions.name),
    db
      .select({
        key: nationPolicyDefinitions.key,
        name: nationPolicyDefinitions.name,
        category: nationPolicyDefinitions.category,
        type: nationPolicyDefinitions.type,
        value: nationPolicyValues.value,
      })
      .from(nationPolicyValues)
      .innerJoin(
        nationPolicyDefinitions,
        eq(nationPolicyValues.policyKey, nationPolicyDefinitions.key),
      )
      .where(eq(nationPolicyValues.nationId, nation.id))
      .orderBy(nationPolicyDefinitions.category, nationPolicyDefinitions.name),
    db
      .select({
        id: nationChanges.id,
        kind: nationChanges.kind,
        key: nationChanges.key,
        previousValue: nationChanges.previousValue,
        newValue: nationChanges.newValue,
        createdAt: nationChanges.createdAt,
        billId: bills.id,
        executiveOrderId: nationChanges.executiveOrderId,
        billTitle: bills.title,
        orderTitle: executiveOrders.title,
      })
      .from(nationChanges)
      .leftJoin(bills, eq(nationChanges.billId, bills.id))
      .leftJoin(
        executiveOrders,
        eq(nationChanges.executiveOrderId, executiveOrders.id),
      )
      .where(eq(nationChanges.nationId, nation.id))
      .orderBy(desc(nationChanges.createdAt))
      .limit(12),
    db
      .select({
        id: nationChanges.id,
        billId: nationChanges.billId,
        executiveOrderId: nationChanges.executiveOrderId,
        billTitle: bills.title,
        orderTitle: executiveOrders.title,
        kind: nationChanges.kind,
        key: nationChanges.key,
        previousValue: nationChanges.previousValue,
        newValue: nationChanges.newValue,
        createdAt: nationChanges.createdAt,
      })
      .from(nationChanges)
      .leftJoin(bills, eq(nationChanges.billId, bills.id))
      .leftJoin(
        executiveOrders,
        eq(nationChanges.executiveOrderId, executiveOrders.id),
      )
      .where(eq(nationChanges.nationId, nation.id))
      .orderBy(asc(nationChanges.createdAt), asc(nationChanges.id)),
  ]);
  const names = new Map(
    [...stats, ...policies].map((record) => [record.key, record.name]),
  );
  return {
    nation,
    stats,
    history: buildNationHistory(
      STAT_DEFINITIONS,
      new Map(stats.map((stat) => [stat.key, stat.value])),
      allChanges
        .filter(
          (change) =>
            change.kind === "stat" || change.kind === "stat_cancellation",
        )
        .map((change) => ({
          ...change,
          billTitle:
            change.billTitle ??
            `${change.kind === "stat_cancellation" ? "Executive order cancellation" : "Executive order"}: ${change.orderTitle}`,
          previousValue: change.previousValue as number,
          newValue: change.newValue as number,
        })),
    ),
    policies: policies.map((policy) => ({
      ...policy,
      value: FIXED_POLICY_VALUES[policy.key] ?? policy.value,
    })),
    recentChanges: recentChanges.map((change) => ({
      ...change,
      billTitle:
        change.billTitle ??
        `${change.kind.endsWith("_cancellation") ? "Executive order cancellation" : "Executive order"}: ${change.orderTitle}`,
      name: names.get(change.key) ?? change.key,
    })),
  };
});
