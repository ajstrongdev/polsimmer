import { useEffect, useEffectEvent, useState } from "react";
import { DeadlineTooltip } from "@/components/deadline-tooltip";

/**
 * Display label for a bill status. The database value stays "Committee" —
 * only the frontend copy calls it "Senate Committee".
 */
export function billStatusLabel(status: string | null | undefined): string {
  return status === "Committee" ? "Senate Committee" : (status ?? "Unknown");
}

type BillStageRef = {
  status?: string | null;
  stage?: string | null;
};

/**
 * Human-readable name of the stage a bill advances to when its current
 * deadline passes. Null when the lifecycle is complete.
 */
export function getNextBillStage(bill: BillStageRef): string | null {
  if (bill.status === "Committee") return "House voting";
  if (bill.status === "Voting") {
    if (bill.stage === "House") return "Senate voting";
    if (bill.stage === "Senate") return "Presidential decision";
    if (bill.stage === "Presidential") return "Result announced";
  }
  return null;
}

/**
 * Revalidate immediately plus a few delayed retries. The backend tick can
 * land after the countdown hits zero, and a single invalidate that refetches
 * the same stale deadline would leave "Advancing now" on screen with no
 * further retries — so keep polling briefly until the tick lands.
 */
export function invalidateAfterBillExpiry(invalidate: () => void) {
  invalidate();
  for (const delay of [10_000, 30_000, 60_000]) {
    window.setTimeout(invalidate, delay);
  }
}

function formatRemaining(milliseconds: number, expiredLabel: string) {
  if (milliseconds <= 0) return expiredLabel;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function BillStageCountdown({
  target,
  onExpire,
  expiredLabel = "Advancing now",
}: {
  target: Date | string | null | undefined;
  onExpire?: () => void;
  expiredLabel?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expire = useEffectEvent(() => {
    onExpire?.();
  });
  const targetTime = target ? new Date(target).getTime() : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(targetTime)) {
      setRemaining(null);
      return;
    }

    let expired = false;
    const update = () => {
      const next = Math.max(0, targetTime - Date.now());
      setRemaining(next);
      if (next === 0 && !expired) {
        expired = true;
        expire();
      }
    };

    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [targetTime]);

  if (remaining === null) return null;

  return (
    <DeadlineTooltip target={target}>
      <span className="font-mono tabular-nums" aria-live="off">
        {formatRemaining(remaining, expiredLabel)}
      </span>
    </DeadlineTooltip>
  );
}
