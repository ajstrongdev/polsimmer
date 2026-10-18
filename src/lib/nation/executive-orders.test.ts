import { expect, test } from "bun:test";
import { aggregateStatEffects, applyDiminishingEffect } from "./simulation";
import {
  canIssueOrder,
  aggregateOrderAssessments,
  policyAfterCancellation,
  reversal,
  validateOrder,
  validateOrderAssessment,
} from "./executive-orders";

test("president submits text; Senate chooses bounded stat effects", () => {
  expect(() => validateOrder("", "A description")).toThrow();
  expect(() => validateOrder("Title", " ")).toThrow();
  expect(() => validateOrder("Title", "Description")).not.toThrow();
  expect(() => validateOrderAssessment([])).toThrow();
  expect(() =>
    validateOrderAssessment([{ statKey: "government_system", effect: 1 }]),
  ).toThrow();
  expect(() =>
    validateOrderAssessment([
      { statKey: "public_trust", effect: 1 },
      { statKey: "public_trust", effect: 2 },
    ]),
  ).toThrow();
  expect(() =>
    validateOrderAssessment([{ statKey: "public_trust", effect: 3 }]),
  ).toThrow();
  expect(() =>
    validateOrderAssessment([
      { statKey: "public_trust", effect: -2 },
      { statKey: "happiness", effect: 0 },
    ]),
  ).not.toThrow();
  expect(aggregateStatEffects([-2, 0])).toBe(-1);
  expect(
    aggregateOrderAssessments([
      [
        { statKey: "public_trust", effect: -2 },
        { statKey: "happiness", effect: 1 },
      ],
      [{ statKey: "public_trust", effect: 0 }],
    ]),
  ).toEqual([
    { statKey: "public_trust", effect: -1 },
    { statKey: "happiness", effect: 1 },
  ]);
  const next = applyDiminishingEffect(
    50,
    aggregateStatEffects([-2, 0]),
    0,
    100,
  );
  expect(reversal(next, next - 50)).toBe(50);
  expect(canIssueOrder(2)).toBe(true);
  expect(canIssueOrder(3)).toBe(false);
});

test("cancelling legacy overlapping policies never revives a cancelled order", () => {
  const cancelledAt = new Date();
  const changes = [
    { executiveOrderId: 1, cancelledAt, previousValue: false, newValue: true },
    {
      executiveOrderId: 2,
      cancelledAt: null,
      previousValue: true,
      newValue: false,
    },
  ];
  expect(policyAfterCancellation(changes)).toBe(false);
  expect(
    policyAfterCancellation(
      changes.map((change) => ({ ...change, cancelledAt })),
    ),
  ).toBe(false);
  expect(
    policyAfterCancellation([
      {
        executiveOrderId: null,
        cancelledAt: null,
        previousValue: false,
        newValue: true,
      },
      ...changes.map((change) => ({ ...change, cancelledAt })),
    ]),
  ).toBe(true);
});
