import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useDeferredValue, useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import {
  BillStageCountdown,
  invalidateAfterBillExpiry,
} from "@/components/bills/bill-stage-countdown";
import { WikiHeader } from "@/components/wiki/wiki-header";
import { WikiEmpty, WikiPage } from "@/components/wiki/wiki-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  STAT_BY_KEY,
  STAT_DEFINITIONS,
  formatPolicyValue,
} from "@/lib/nation/catalog";
import { DAILY_ORDER_LIMIT } from "@/lib/nation/executive-orders";
import {
  assessExecutiveOrder,
  cancelExecutiveOrder,
  getExecutiveOrders,
  issueExecutiveOrder,
} from "@/lib/server/nation/executive-orders";

export const Route = createFileRoute("/dashboard/executive-orders")({
  loader: () => getExecutiveOrders(),
  component: ExecutiveOrders,
});

type Stage = "All" | "Committee" | "In force" | "Cancelled";
const stages: Array<Stage> = ["All", "Committee", "In force", "Cancelled"];
const status = (order: {
  cancelledAt: Date | null;
  enactedAt: Date | null;
}): Stage =>
  order.cancelledAt ? "Cancelled" : order.enactedAt ? "In force" : "Committee";
type Impact = { name: string; effect: number };
const blankImpact = (): Impact => ({ name: "", effect: 1 });

function ExecutiveOrders() {
  const { orders, role, ordersRemaining, nextResetAt } = Route.useLoaderData();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("All");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const matching = orders.filter((order) =>
    `${order.title} ${order.description} ${order.president} ${order.effects.map((effect) => effect.name).join(" ")}`
      .toLowerCase()
      .includes(deferredQuery),
  );
  const filtered = matching.filter(
    (order) => stage === "All" || status(order) === stage,
  );
  const refreshAtDeadline = () =>
    invalidateAfterBillExpiry(() => {
      void router.invalidate();
    });

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await issueExecutiveOrder({ data: { title, description } });
      setTitle("");
      setDescription("");
      setCreateOpen(false);
      toast.success("Order sent to Senate Committee");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not submit order",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(orderId: number) {
    if (
      !window.confirm(
        "Cancel this executive order? Enacted effects will be reversed.",
      )
    )
      return;
    setBusy(true);
    try {
      await cancelExecutiveOrder({ data: { orderId } });
      toast.success("Executive order cancelled");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel order",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assess(
    orderId: number,
    effects: Array<{ statKey: string; effect: number }>,
  ) {
    setBusy(true);
    try {
      await assessExecutiveOrder({ data: { orderId, effects } });
      toast.success("Assessment saved");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save assessment",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <WikiPage>
      <WikiHeader
        eyebrow={`${orders.length} orders`}
        title="Executive orders"
        description="The president submits an order to a 12-hour Senate Committee. Senators assess up to two national indicators; their combined assessment takes effect when committee closes. Without assessments, no stats change. Orders cannot change policies."
      >
        {role === "President" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {ordersRemaining} of {DAILY_ORDER_LIMIT} orders available
              </span>
              {nextResetAt && (
                <span className="text-xs text-muted-foreground">
                  Next available in{" "}
                  <BillStageCountdown
                    target={nextResetAt}
                    expiredLabel="Refreshing…"
                    onExpire={refreshAtDeadline}
                  />
                </span>
              )}
            </div>
            <Button
              disabled={ordersRemaining === 0}
              onClick={() => setCreateOpen(true)}
            >
              Issue an order
            </Button>
          </div>
        )}
      </WikiHeader>
      <Tabs
        value={stage}
        onValueChange={(value) => setStage(value as Stage)}
        className="min-w-0 gap-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-3 py-3 sm:px-4">
          <div className="overflow-x-auto">
            <TabsList
              aria-label="Order status"
              className="h-11 min-w-max gap-1 rounded-sm bg-transparent p-0"
            >
              {stages.map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 rounded-sm px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {value}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {
                      matching.filter(
                        (order) => value === "All" || status(order) === value,
                      ).length
                    }
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <label className="relative flex-1 sm:max-w-64">
            <span className="sr-only">Search executive orders</span>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              className="h-10 rounded-sm bg-muted/50 pl-9 shadow-none"
            />
          </label>
        </div>
        <TabsContent value={stage} className="mt-0">
          <section
            aria-label={`${stage} executive orders`}
            className="divide-y border-x border-b bg-card"
          >
            {filtered.map((order) => (
              <details
                key={order.id}
                className="group border-l-2 border-l-transparent open:border-l-primary hover:bg-muted/30"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-sm">
                        {status(order)}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        Order #{order.id}
                      </span>
                    </div>
                    <h2 className="font-serif text-lg font-bold leading-snug sm:text-xl">
                      {order.title}
                    </h2>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {order.description || "No description available"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted by {order.president} ·{" "}
                      {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                      {order.assessmentCount} Senate{" "}
                      {order.assessmentCount === 1
                        ? "assessment"
                        : "assessments"}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Read order{" "}
                    <ArrowRight className="size-4 transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <div className="space-y-4 border-t px-4 py-5 sm:px-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {order.description || "No description available"}
                  </p>
                  {status(order) === "Committee" && order.committeeEndsAt && (
                    <p className="text-sm text-muted-foreground">
                      Committee closes in{" "}
                      <BillStageCountdown
                        target={order.committeeEndsAt}
                        expiredLabel="Enacting…"
                        onExpire={refreshAtDeadline}
                      />
                    </p>
                  )}
                  {order.effects.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {order.effects.map((effect) => (
                        <span
                          key={effect.statKey}
                          className="rounded-sm border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <strong>{effect.name}</strong>{" "}
                          {effect.effect > 0 ? "+" : ""}
                          {effect.effect}
                        </span>
                      ))}
                      {order.policy && (
                        <span className="rounded-sm border bg-muted/30 px-3 py-2 text-sm">
                          <strong>{order.policy.name}</strong> →{" "}
                          {formatPolicyValue(order.policy.newValue)} (legacy)
                        </span>
                      )}
                    </div>
                  )}
                  {role === "Senator" && status(order) === "Committee" && (
                    <AssessmentForm
                      key={order.id}
                      ownAssessment={order.ownAssessment}
                      busy={busy}
                      onSave={(effects) => assess(order.id, effects)}
                    />
                  )}
                  {role === "President" && !order.cancelledAt && (
                    <div className="flex justify-end border-t pt-4">
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() => cancel(order.id)}
                      >
                        Cancel order
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            ))}
            {!filtered.length && (
              <WikiEmpty>
                {deferredQuery
                  ? "No orders match your search."
                  : stage === "All"
                    ? "No executive orders yet."
                    : `No ${stage.toLowerCase()} orders.`}
              </WikiEmpty>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Issue an executive order</DialogTitle>
            <DialogDescription>
              Write the order. Senators choose its effects during a 12-hour
              committee period. No policies can be changed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={issue} className="space-y-5">
            <label className="grid gap-1.5 text-sm font-medium">
              Title
              <Input
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Description
              <textarea
                required
                maxLength={2000}
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What does this order do?"
              />
            </label>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Submit to committee
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </WikiPage>
  );
}

function AssessmentForm({
  ownAssessment,
  busy,
  onSave,
}: {
  ownAssessment: Array<{ statKey: string; effect: number }> | null;
  busy: boolean;
  onSave: (effects: Array<{ statKey: string; effect: number }>) => void;
}) {
  const [impacts, setImpacts] = useState<Array<Impact>>(() =>
    ownAssessment?.length
      ? ownAssessment.map(({ statKey, effect }) => ({
          name: STAT_BY_KEY.get(statKey)?.name ?? statKey,
          effect,
        }))
      : [blankImpact()],
  );
  function setImpact(index: number, impact: Impact) {
    setImpacts((current) =>
      current.map((item, i) => (i === index ? impact : item)),
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const effects = impacts.map(({ name, effect }) => ({
      statKey: STAT_DEFINITIONS.find(
        (stat) => stat.name.toLowerCase() === name.trim().toLowerCase(),
      )?.key,
      effect,
    }));
    if (effects.some((item) => !item.statKey))
      return void toast.error("Choose an indicator from the suggestions");
    if (new Set(effects.map((item) => item.statKey)).size !== effects.length)
      return void toast.error("Choose different indicators");
    onSave(effects as Array<{ statKey: string; effect: number }>);
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <h3 className="font-serif font-bold">Senate assessment</h3>
      <p className="text-xs text-muted-foreground">
        Choose up to two national indicators and assess the effect of this
        order. Assessments can be revised until committee closes.
      </p>
      {impacts.map((impact, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-44 flex-1 gap-1 text-sm">
            Indicator {index + 1}
            <Input
              list="order-stat-suggestions"
              required
              placeholder="Search indicators…"
              value={impact.name}
              onChange={(event) =>
                setImpact(index, { ...impact, name: event.target.value })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Effect
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={impact.effect}
              onChange={(event) =>
                setImpact(index, {
                  ...impact,
                  effect: Number(event.target.value),
                })
              }
            >
              {[-2, -1, 0, 1, 2].map((value) => (
                <option key={value} value={value}>
                  {value > 0 ? `+${value}` : value}
                </option>
              ))}
            </select>
          </label>
          {index === 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImpacts((current) => current.slice(0, 1))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <datalist id="order-stat-suggestions">
        {STAT_DEFINITIONS.map((stat) => (
          <option key={stat.key} value={stat.name} />
        ))}
      </datalist>
      {impacts.length === 1 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImpacts((current) => [...current, blankImpact()])}
        >
          + Add indicator
        </Button>
      )}
      <div>
        <Button size="sm" type="submit" disabled={busy}>
          {ownAssessment ? "Update assessment" : "Submit assessment"}
        </Button>
      </div>
    </form>
  );
}
