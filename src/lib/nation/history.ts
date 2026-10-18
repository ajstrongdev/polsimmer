import type { StatDefinition } from "@/lib/nation/catalog";
import { calculateHeadlineIndices } from "@/lib/nation/simulation";

export type NationStatChange = {
  id: number;
  billId: number | null;
  executiveOrderId?: number | null;
  billTitle: string;
  key: string;
  previousValue: number | string | boolean;
  newValue: number | string | boolean;
  createdAt: Date;
};

export function buildNationHistory(
  definitions: Array<StatDefinition>,
  currentValues: ReadonlyMap<string, number>,
  changes: Array<NationStatChange>,
) {
  const values = new Map(currentValues);
  const statChanges = changes.filter((change) =>
    definitions.some((definition) => definition.key === change.key),
  );

  // Rewind to the first recorded state, then replay each bill or order event.
  for (const change of [...statChanges].reverse()) {
    values.set(change.key, Number(change.previousValue));
  }

  const history = [
    snapshot(null, null, "Starting condition", definitions, values),
  ];
  for (let index = 0; index < statChanges.length;) {
    const event = statChanges[index];
    let end = index;
    while (
      end < statChanges.length &&
      (event.billId !== null
        ? statChanges[end].billId === event.billId
        : event.executiveOrderId != null
          ? statChanges[end].executiveOrderId === event.executiveOrderId &&
            statChanges[end].createdAt.getTime() === event.createdAt.getTime()
          : statChanges[end].id === event.id)
    ) {
      const change = statChanges[end];
      values.set(change.key, Number(change.newValue));
      end += 1;
    }
    history.push(
      snapshot(
        event.createdAt,
        event.billId,
        event.billTitle,
        definitions,
        values,
      ),
    );
    index = end;
  }
  return history;
}

function snapshot(
  at: Date | null,
  billId: number | null,
  label: string,
  definitions: Array<StatDefinition>,
  values: ReadonlyMap<string, number>,
) {
  const headlines = calculateHeadlineIndices(definitions, values);
  return {
    at,
    billId,
    label,
    stats: Object.fromEntries(values),
    ...headlines,
  };
}
