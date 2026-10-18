import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  billLockedPolicyEffects,
  billLockedStatEffects,
  bills,
  nationChanges,
  nationPolicyValues,
  nationStatDefinitions,
  nationStatValues,
  nations,
} from "@/db/schema";
import { STAT_DEFINITIONS, isBillMutablePolicy } from "@/lib/nation/catalog";
import {
  applyDiminishingEffect,
  calculateHeadlineIndices,
} from "@/lib/nation/simulation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function applyPassedBillEffects(tx: Transaction, billId: number) {
  await tx.execute(
    sql`select ${bills.id} from ${bills} where ${bills.id} = ${billId} for update`,
  );
  const [bill] = await tx
    .select()
    .from(bills)
    .where(eq(bills.id, billId))
    .limit(1);
  if (!bill || bill.status !== "Passed")
    throw new Error("Only passed legislation can change the nation");
  if (!bill.committeeClosedAt)
    throw new Error("Passed bill has no locked Senate Committee outcome");
  if (bill.nationEffectsAppliedAt) return false;
  const [nation] = await tx.select().from(nations).limit(1);
  if (!nation) throw new Error("Nation state is not configured");
  await tx.execute(
    sql`select ${nations.id} from ${nations} where ${nations.id} = ${nation.id} for update`,
  );
  const statEffects = await tx
    .select({
      key: billLockedStatEffects.statKey,
      effect: billLockedStatEffects.effect,
      min: nationStatDefinitions.min,
      max: nationStatDefinitions.max,
    })
    .from(billLockedStatEffects)
    .innerJoin(
      nationStatDefinitions,
      eq(billLockedStatEffects.statKey, nationStatDefinitions.key),
    )
    .where(eq(billLockedStatEffects.billId, billId));
  for (const effect of statEffects) {
    const [current] = await tx
      .select()
      .from(nationStatValues)
      .where(
        and(
          eq(nationStatValues.nationId, nation.id),
          eq(nationStatValues.statKey, effect.key),
        ),
      )
      .limit(1);
    if (!current) continue;
    const next = applyDiminishingEffect(
      current.value,
      effect.effect,
      effect.min,
      effect.max,
    );
    await tx
      .update(nationStatValues)
      .set({ value: next, updatedAt: new Date() })
      .where(
        and(
          eq(nationStatValues.nationId, nation.id),
          eq(nationStatValues.statKey, effect.key),
        ),
      );
    await tx
      .insert(nationChanges)
      .values({
        nationId: nation.id,
        billId,
        kind: "stat",
        key: effect.key,
        previousValue: current.value,
        newValue: next,
      })
      .onConflictDoNothing();
  }
  const policyEffects = await tx
    .select()
    .from(billLockedPolicyEffects)
    .where(eq(billLockedPolicyEffects.billId, billId));
  for (const effect of policyEffects) {
    if (!isBillMutablePolicy(effect.policyKey)) continue;
    const [current] = await tx
      .select()
      .from(nationPolicyValues)
      .where(
        and(
          eq(nationPolicyValues.nationId, nation.id),
          eq(nationPolicyValues.policyKey, effect.policyKey),
        ),
      )
      .limit(1);
    if (!current) continue;
    await tx
      .update(nationPolicyValues)
      .set({ value: effect.newValue, updatedAt: new Date() })
      .where(
        and(
          eq(nationPolicyValues.nationId, nation.id),
          eq(nationPolicyValues.policyKey, effect.policyKey),
        ),
      );
    await tx
      .insert(nationChanges)
      .values({
        nationId: nation.id,
        billId,
        kind: "policy",
        key: effect.policyKey,
        previousValue: current.value,
        newValue: effect.newValue,
      })
      .onConflictDoNothing();
  }
  await updateNationHeadlines(tx, nation.id);
  await tx
    .update(bills)
    .set({ nationEffectsAppliedAt: new Date() })
    .where(
      and(eq(bills.id, billId), sql`${bills.nationEffectsAppliedAt} is null`),
    );
  return true;
}

export async function updateNationHeadlines(tx: Transaction, nationId: number) {
  const values = await tx
    .select()
    .from(nationStatValues)
    .where(eq(nationStatValues.nationId, nationId));
  const headlines = calculateHeadlineIndices(
    STAT_DEFINITIONS,
    new Map(values.map((row) => [row.statKey, row.value])),
  );
  await tx
    .update(nations)
    .set({
      civilRights: headlines.civil_rights,
      economy: headlines.economy,
      politicalFreedoms: headlines.political_freedoms,
      updatedAt: new Date(),
    })
    .where(eq(nations.id, nationId));
}
