/**
 * Workflow Dashboard Screen — high-level metrics derived from inbox + sent.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInbox, fetchSent } from "../api.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="text-[0.65rem] uppercase text-zinc-500 tracking-wider">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 mt-1 font-mono">{value}</div>
    </div>
  );
}

function TopList({ label, rows, empty }: { label: string; rows: Array<[string, number]>; empty: string }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="text-[0.65rem] uppercase text-zinc-500 tracking-wider mb-2">{label}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-500">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {rows.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between text-sm">
              <span className="font-mono text-zinc-300 truncate">{k}</span>
              <span className="text-zinc-500 font-mono">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkflowDashboardScreen({ address }: { address: string }) {
  const inbox = useQuery({
    queryKey: ["wf-inbox", address],
    queryFn: () => fetchInbox(address, { state: "any", visibility: "any" }),
    enabled: !!address,
  });
  const sent = useQuery({
    queryKey: ["wf-sent", address],
    queryFn: () => fetchSent(address, { visibility: "any" }),
    enabled: !!address,
  });

  const stats = useMemo(() => {
    const rx = inbox.data?.items ?? [];
    const tx = sent.data?.items ?? [];
    const now = Date.now();
    const rxWeek = rx.filter((m) => now - m.delivered_at_ms < WEEK_MS);
    const txWeek = tx.filter((m) => now - m.created_at_ms < WEEK_MS);

    const rxConvs = new Set(rx.map((m) => m.conversation_id));
    const txConvs = new Set(tx.map((m) => m.conversation_id));
    const responded = [...rxConvs].filter((c) => txConvs.has(c)).length;
    const responseRate = rxConvs.size > 0 ? Math.round((responded / rxConvs.size) * 100) : 0;

    const active = new Set<string>();
    for (const m of rxWeek) active.add(m.conversation_id);
    for (const m of txWeek) active.add(m.conversation_id);

    const senderCounts = new Map<string, number>();
    for (const m of rx) senderCounts.set(m.sender, (senderCounts.get(m.sender) ?? 0) + 1);
    const topSenders = [...senderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const convCounts = new Map<string, number>();
    for (const m of tx) convCounts.set(m.conversation_id, (convCounts.get(m.conversation_id) ?? 0) + 1);
    const topTx = [...convCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    return { totalWeek: rxWeek.length + txWeek.length, responseRate, activeCount: active.size, topSenders, topTx };
  }, [inbox.data, sent.data]);

  const isLoading = inbox.isLoading || sent.isLoading;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Workflow Dashboard</h2>
        <span className="text-xs text-zinc-500">Derived from inbox + sent</span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading metrics...</span></div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="Messages this week" value={String(stats.totalWeek)} />
            <StatCard label="Response rate" value={`${stats.responseRate}%`} />
            <StatCard label="Active conversations" value={String(stats.activeCount)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TopList label="Top senders" rows={stats.topSenders} empty="No senders yet" />
            <TopList label="Top outbound conversations" rows={stats.topTx} empty="Nothing sent yet" />
          </div>
        </div>
      )}
    </div>
  );
}
