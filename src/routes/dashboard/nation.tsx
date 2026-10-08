import { Link, createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  History,
  Landmark,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { ResultBar, WikiHeader } from "@/components/wiki/wiki-header";
import {
  WikiEmpty,
  WikiPage,
  WikiSearch,
  WikiSection,
} from "@/components/wiki/wiki-layout";
import { formatPolicyValue } from "@/lib/nation/catalog";
import { instance } from "@/lib/instance-config";
import { getNationOverview } from "@/lib/server/nation/nation";

export const Route = createFileRoute("/dashboard/nation")({
  loader: () => getNationOverview(),
  component: NationOverview,
});

type PolicyRecord = {
  key: string;
  name: string;
  category: string;
  type: string;
  value: boolean | number | string;
};

function NationOverview() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selectedStat, setSelectedStat] = useState("");

  if (!data)
    return (
      <WikiPage>
        <WikiEmpty>Nation state has not been configured.</WikiEmpty>
      </WikiPage>
    );

  const matchingPolicies = data.policies.filter(
    (policy) =>
      policy.name.toLowerCase().includes(deferredQuery) ||
      formatCategory(policy.category).toLowerCase().includes(deferredQuery),
  );
  const activePolicies = matchingPolicies.filter(isPolicyActive);
  const inactivePolicies = matchingPolicies.filter(
    (policy) => !isPolicyActive(policy),
  );
  const activeGroups = groupByCategory(activePolicies);
  const inactiveGroups = groupByCategory(inactivePolicies);
  const statGroups = groupByCategory(data.stats);
  const activeStat =
    data.stats.find((stat) => stat.key === selectedStat) ?? data.stats[0];

  return (
    <WikiPage>
      <WikiHeader
        eyebrow="The nation today"
        title={instance.nationName}
        description="See the laws that define daily life, the condition of the country, and how legislation is changing both."
        status={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> Live nation
          </span>
        }
      />

      <WikiSection
        title="National condition"
        icon={Scale}
        description="Three headline measures summarise how the country is performing."
      >
        <div className="grid overflow-hidden border bg-card md:grid-cols-3 md:divide-x">
          <Headline
            label="Civil rights"
            value={data.nation.civilRights}
            icon={ShieldCheck}
          />
          <Headline
            label="Economy"
            value={data.nation.economy}
            icon={Activity}
          />
          <Headline
            label="Political freedoms"
            value={data.nation.politicalFreedoms}
            icon={Landmark}
          />
        </div>
      </WikiSection>

      <WikiSection
        title="National trends"
        icon={History}
        description="Track every indicator and the headline measures across each law that changed the nation."
      >
        {data.history.length > 1 ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <HistoryChart
                title="National condition"
                description="How the three national condition measures have moved."
                history={data.history}
                lines={[
                  {
                    key: "civil_rights",
                    label: "Civil rights",
                    color: "var(--chart-1)",
                  },
                  { key: "economy", label: "Economy", color: "var(--chart-2)" },
                  {
                    key: "political_freedoms",
                    label: "Political freedoms",
                    color: "var(--chart-3)",
                  },
                ]}
              />
              {activeStat && (
                <div className="border bg-card p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg font-bold">
                        Indicator history
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Choose any national indicator to view its full trend.
                      </p>
                    </div>
                    <label className="sr-only" htmlFor="nation-stat-history">
                      Choose indicator
                    </label>
                    <select
                      id="nation-stat-history"
                      value={selectedStat || activeStat.key}
                      onChange={(event) => setSelectedStat(event.target.value)}
                      className="max-w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {[...statGroups].map(([category, stats]) => (
                        <optgroup
                          key={category}
                          label={formatCategory(category)}
                        >
                          {stats.map((stat) => (
                            <option key={stat.key} value={stat.key}>
                              {stat.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <HistoryChart
                    title={activeStat.name}
                    history={data.history}
                    lines={[
                      {
                        key: `stat:${activeStat.key}`,
                        label: activeStat.name,
                        color: "var(--primary)",
                      },
                    ]}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Values show the starting state and each passed bill that changed a
              statistic. Hover a point to see the bill and exact score. Policies
              are tracked in the change list below.
            </p>
          </div>
        ) : (
          <WikiEmpty>
            Charts will appear after legislation changes the national
            statistics.
          </WikiEmpty>
        )}
      </WikiSection>

      <WikiSearch
        value={query}
        onChange={setQuery}
        placeholder="Find a policy or area of government"
        resultCount={activePolicies.length + inactivePolicies.length}
      />

      <WikiSection
        title="Policies in force"
        icon={ShieldCheck}
        description="The laws, public systems, and constitutional choices currently shaping the nation."
        aside={
          <span className="font-mono text-xs text-muted-foreground">
            {activePolicies.length} active
          </span>
        }
      >
        {activeGroups.size ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {[...activeGroups].map(([category, policies]) => (
              <section
                key={category}
                className="overflow-hidden rounded-sm border bg-card"
              >
                <header className="flex items-center justify-between gap-4 border-b bg-muted/35 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-primary" />
                    <h3 className="font-serif font-bold">
                      {formatCategory(category)}
                    </h3>
                  </div>
                  <span className="font-mono text-[0.65rem] text-muted-foreground">
                    {policies.length}{" "}
                    {policies.length === 1 ? "policy" : "policies"}
                  </span>
                </header>
                <div className="divide-y">
                  {policies.map((policy) => (
                    <div
                      key={policy.key}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-sm font-medium">
                          {policy.name}
                        </span>
                      </div>
                      <span className="max-w-[45%] text-right text-xs font-semibold text-muted-foreground">
                        {describePolicy(policy)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <WikiEmpty>No active policies match this search.</WikiEmpty>
        )}
      </WikiSection>

      {data.recentChanges.length > 0 && (
        <WikiSection
          title="What changed"
          icon={History}
          description="The latest laws to leave a mark on the nation."
        >
          <div className="divide-y border-y">
            {data.recentChanges.map((change) => (
              <Link
                key={change.id}
                to="/dashboard/bills/$billId"
                params={{ billId: String(change.billId) }}
                className="group flex flex-col gap-1 px-3 py-3 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-sm">
                  <strong>{change.name}</strong>
                  <span className="text-muted-foreground">
                    {" "}
                    changed by {change.billTitle}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground group-hover:text-primary">
                  {formatChange(change.kind, change.previousValue)} →{" "}
                  {formatChange(change.kind, change.newValue)}
                </span>
              </Link>
            ))}
          </div>
        </WikiSection>
      )}

      <WikiSection
        title="National indicators"
        icon={Activity}
        description="Open an area to inspect the evidence behind the national picture."
      >
        <div className="grid items-start gap-3 md:grid-cols-2">
          {[...statGroups].map(([category, stats]) => (
            <details
              key={category}
              className="group overflow-hidden border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30">
                <span className="font-serif font-bold">
                  {formatCategory(category)}
                </span>
                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  {stats.length} indicators
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="divide-y border-t">
                {stats.map((stat) => (
                  <div key={stat.key} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span>{stat.name}</span>
                      <strong className="font-mono">
                        {Math.round(stat.value)}
                      </strong>
                    </div>
                    <ResultBar value={stat.value} />
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </WikiSection>

      <WikiSection
        title="Inactive policies"
        icon={CircleDashed}
        description="These measures are not currently part of national law. Open an area to explore them."
        aside={
          <span className="font-mono text-xs text-muted-foreground">
            {inactivePolicies.length} inactive
          </span>
        }
      >
        {inactiveGroups.size ? (
          <div className="grid items-start gap-3 md:grid-cols-2">
            {[...inactiveGroups].map(([category, policies]) => (
              <details
                key={category}
                open={deferredQuery ? true : undefined}
                className="group overflow-hidden border bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30">
                  <span className="font-serif font-bold">
                    {formatCategory(category)}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    {policies.length}
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="divide-y border-t">
                  {policies.map((policy) => (
                    <div
                      key={policy.key}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground"
                    >
                      <CircleDashed className="h-3.5 w-3.5 shrink-0" />
                      {policy.name}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <WikiEmpty>No inactive policies match this search.</WikiEmpty>
        )}
      </WikiSection>
    </WikiPage>
  );
}

type HistoryPoint = {
  at: Date | null;
  billId: number | null;
  label: string;
  civil_rights: number;
  economy: number;
  political_freedoms: number;
  stats: Record<string, number>;
};

function HistoryChart({
  title,
  description,
  history,
  lines,
}: {
  title: string;
  description?: string;
  history: Array<HistoryPoint>;
  lines: Array<{ key: string; label: string; color: string }>;
}) {
  const chartData = history.map((point, index) => ({
    ...point,
    pointLabel: point.at
      ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
          new Date(point.at),
        )
      : "Starting point",
    index,
    ...Object.fromEntries(
      lines.map((line) => [
        line.key,
        line.key.startsWith("stat:")
          ? point.stats[line.key.slice(5)]
          : point[
              line.key as "civil_rights" | "economy" | "political_freedoms"
            ],
      ]),
    ),
  }));

  return (
    <div className="min-w-0 border bg-card p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="font-serif text-lg font-bold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, left: -18, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) =>
                chartData[value]?.pointLabel ?? ""
              }
              minTickGap={28}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={36} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof chartData)[number];
                return (
                  <div className="max-w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
                    <p className="text-xs text-muted-foreground">
                      {point.pointLabel}
                    </p>
                    <p className="mb-2 text-sm font-semibold">
                      {point.billId
                        ? `Bill #${point.billId}: ${point.label}`
                        : point.label}
                    </p>
                    {payload.map((item) => (
                      <p key={item.dataKey} className="text-xs">
                        <span style={{ color: item.color }}>{item.name}</span>:{" "}
                        <strong>{Number(item.value).toFixed(1)}</strong>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Headline({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  const description =
    value >= 70 ? "Strong" : value >= 40 ? "Developing" : "Under pressure";
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="wiki-kicker">{label}</p>
          <p className="mt-1 font-serif text-3xl font-bold">
            {Math.round(value)}
          </p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4">
        <ResultBar value={value} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function isPolicyActive(policy: PolicyRecord) {
  return typeof policy.value !== "boolean" || policy.value;
}

function describePolicy(policy: PolicyRecord) {
  if (policy.key === "government_system") return "Presidential Republic";
  if (policy.key === "head_of_state_type") return "President";
  if (typeof policy.value === "boolean") return "In force";
  if (typeof policy.value === "number") {
    if (policy.name.includes("Age")) return `Age ${policy.value}`;
    if (policy.name === "Maximum Working Week") return `${policy.value} hours`;
    if (policy.name === "National Speed Limit") return `${policy.value} km/h`;
  }
  return formatPolicyValue(policy.value);
}

function formatChange(kind: string, value: boolean | number | string) {
  return kind === "policy"
    ? formatPolicyValue(value)
    : Number(value).toFixed(1);
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function groupByCategory<T extends { category: string }>(records: Array<T>) {
  const groups = new Map<string, Array<T>>();
  for (const record of records) {
    groups.set(record.category, [
      ...(groups.get(record.category) ?? []),
      record,
    ]);
  }
  return groups;
}
