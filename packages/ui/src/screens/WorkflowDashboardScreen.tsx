/**
 * Workflow Dashboard Screen — message volume + engagement metrics.
 *
 * Fetches the server-side aggregation from GET /api/analytics/overview
 * (landed in PR #127). Replaces the prior client-side aggregation over
 * /api/inbox + /api/sent — the BFF now owns the SQL and the UI just
 * renders validated contract output.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsOverviewResponse,
  AnalyticsTimeWindow,
  AnalyticsTopEntry,
} from "@inbox/contracts";
import { fetchAnalyticsOverview } from "../api.js";
import { Button } from "../components/primitives/Button.js";

const WINDOWS: ReadonlyArray<{ key: AnalyticsTimeWindow; label: string }> = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="text-[0.65rem] uppercase text-zinc-500 tracking-wider">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 mt-1 font-mono">{value}</div>
    </div>
  );
}

function ResponseRateCard({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  // Traffic-light color so a low rate jumps out visually without a chart dep.
  const color =
    pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400";
  const bar =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="text-[0.65rem] uppercase text-zinc-500 tracking-wider">Response rate</div>
      <div className={`text-2xl font-semibold mt-1 font-mono ${color}`}>{pct}%</div>
      <div className="mt-2 h-1.5 rounded bg-zinc-900 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TopList({
  label,
  rows,
  empty,
}: {
  label: string;
  rows: ReadonlyArray<AnalyticsTopEntry>;
  empty: string;
}) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="text-[0.65rem] uppercase text-zinc-500 tracking-wider mb-2">{label}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-500">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.address} className="flex items-center justify-between text-sm">
              <span className="font-mono text-zinc-300 truncate">{row.address}</span>
              <span className="text-zinc-500 font-mono">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WindowSelector({
  value,
  onChange,
}: {
  value: AnalyticsTimeWindow;
  onChange: (w: AnalyticsTimeWindow) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden" role="tablist">
      {WINDOWS.map((w) => {
        const active = value === w.key;
        return (
          <button
            key={w.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(w.key)}
            className={`px-3 py-1 text-xs font-medium transition-colors border-r border-zinc-700 last:border-r-0 ${
              active
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

function Metrics({ data }: { data: AnalyticsOverviewResponse }) {
  if (data.inbox_count === 0 && data.sent_count === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
        No activity in this window
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Inbox" value={String(data.inbox_count)} />
        <StatCard label="Sent" value={String(data.sent_count)} />
        <ResponseRateCard rate={data.response_rate} />
        <StatCard label="Active conversations" value={String(data.active_conversations)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TopList label="Top senders" rows={data.top_senders} empty="No senders yet" />
        <TopList label="Top recipients" rows={data.top_recipients} empty="Nothing sent yet" />
      </div>
    </div>
  );
}

export function WorkflowDashboardScreen({ address }: { address: string }) {
  const [window, setWindow] = useState<AnalyticsTimeWindow>("week");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["analytics", address, window],
    queryFn: () => fetchAnalyticsOverview(address, window),
    enabled: !!address,
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Workflow Dashboard</h2>
        <span className="text-xs text-zinc-500">Analytics overview</span>
        <div className="ml-auto">
          <WindowSelector value={window} onChange={setWindow} />
        </div>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <span className="animate-pulse">Loading analytics...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 bg-zinc-800 border border-red-900 rounded-lg p-4">
            <div className="text-sm text-red-400 font-mono">
              {error instanceof Error ? error.message : "Failed to load analytics"}
            </div>
            <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          </div>
        ) : data ? (
          <Metrics data={data} />
        ) : null}
      </div>
    </div>
  );
}
