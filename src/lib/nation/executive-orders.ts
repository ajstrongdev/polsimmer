import { STAT_BY_KEY, type PolicyValue } from "./catalog";
import { aggregateStatEffects } from "./simulation";

export const DAILY_ORDER_LIMIT = 3;

export function canIssueOrder(issuedInLast24Hours: number) {
  return issuedInLast24Hours < DAILY_ORDER_LIMIT;
}

export function validateOrder(title: string, description: string) {
  if (!title.trim() || title.trim().length > 160)
    throw new Error("Title must be 1–160 characters");
  if (!description.trim() || description.trim().length > 2000)
    throw new Error("Description must be 1–2000 characters");
}

export function reversal(current: number, appliedChange: number) {
  return Math.max(0, Math.min(100, current - appliedChange));
}

export function validateOrderAssessment(
  effects: Array<{ statKey: string; effect: number }>,
) {
  if (
    effects.length < 1 ||
    effects.length > 2 ||
    new Set(effects.map(({ statKey }) => statKey)).size !== effects.length ||
    effects.some(
      ({ statKey, effect }) =>
        !STAT_BY_KEY.has(statKey) ||
        !Number.isInteger(effect) ||
        effect < -2 ||
        effect > 2,
    )
  )
    throw new Error(
      "Assess one or two different indicators on the -2 to +2 scale",
    );
}

export function aggregateOrderAssessments(
  assessments: Array<Array<{ statKey: string; effect: number }>>,
) {
  const scores = new Map<string, Array<number>>();
  for (const effects of assessments)
    for (const { statKey, effect } of effects) {
      if (!scores.has(statKey)) scores.set(statKey, []);
      scores.get(statKey)!.push(effect);
    }
  return [...scores].map(([statKey, values]) => ({
    statKey,
    effect: aggregateStatEffects(values),
  }));
}

export function policyAfterCancellation(
  changes: Array<{
    executiveOrderId: number | null;
    cancelledAt: Date | null;
    previousValue: PolicyValue;
    newValue: PolicyValue;
  }>,
) {
  if (!changes.length) throw new Error("No policy history to restore");
  const seenOrders = new Set<number>();
  let value = changes[0].previousValue;
  for (const change of changes) {
    if (change.executiveOrderId !== null) {
      if (seenOrders.has(change.executiveOrderId)) continue;
      seenOrders.add(change.executiveOrderId);
      if (change.cancelledAt) continue;
    }
    value = change.newValue;
  }
  return value;
}
