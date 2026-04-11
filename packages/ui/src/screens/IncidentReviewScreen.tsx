/**
 * Incident Review Screen — derive "incidents" from existing inbox data.
 * No dedicated incident API yet: stale unread messages become warnings/errors.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInbox } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";

type Severity = "info" | "warning" | "error";
type Incident = { id: string; ts: number; severity: Severity; description: string; actor: string; messageId: string };

const SEV_STYLES: Record<Severity, string> = {
  info: "text-blue-400", warning: "text-yellow-400", error: "text-red-400",
};
const DAY_MS = 24 * 60 * 60 * 1000;

export function IncidentReviewScreen({ address, navigate }: { address: string; navigate: (hash: string) => void }) {
  const [filter, setFilter] = useState<"all" | Severity>("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["incidents-inbox", address],
    queryFn: () => fetchInbox(address, { state: "any", visibility: "any" }),
    enabled: !!address,
  });

  const incidents: Incident[] = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return data.items
      .filter((m) => m.engagement_state === "unread")
      .map((m) => {
        const age = now - m.delivered_at_ms;
        const severity: Severity = age > 3 * DAY_MS ? "error" : age > DAY_MS ? "warning" : "info";
        const description =
          severity === "error"
            ? `Unread for ${Math.floor(age / DAY_MS)} days — stale delivery`
            : severity === "warning"
              ? `Unread for ${Math.floor(age / DAY_MS)} day(s) — potentially missed`
              : "Recent unread — still within SLA";
        return { id: m.delivery_id, ts: m.delivered_at_ms, severity, description, actor: m.sender, messageId: m.message_id };
      })
      .sort((a, b) => b.ts - a.ts);
  }, [data]);

  const filtered = filter === "all" ? incidents : incidents.filter((i) => i.severity === filter);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Incidents</h2>
        <label className="text-xs text-zinc-500">
          Severity:
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="ml-1 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs">
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </label>
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">{filtered.length} incidents</span>
        <Button variant="ghost" onClick={() => refetch()}>Refresh</Button>
      </div>

      <div className="px-4 py-2 text-xs text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
        Derived from unread inbox messages — no dedicated incident API yet.
      </div>

      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading incidents...</span></div>}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load</span>
          <span className="text-xs text-red-400 font-mono">{error instanceof Error ? error.message : "Unknown error"}</span>
        </div>
      )}
      {!isLoading && filtered.length === 0 && <div className="flex items-center justify-center py-12 text-zinc-500">No incidents</div>}

      {filtered.map((inc) => (
        <button
          key={inc.id}
          type="button"
          onClick={() => navigate(`/message/${inc.messageId}`)}
          className="px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900 flex items-start gap-3 text-left cursor-pointer"
        >
          <span className={`text-[0.65rem] font-semibold uppercase w-14 shrink-0 ${SEV_STYLES[inc.severity]}`}>{inc.severity}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200 truncate">{inc.description}</div>
            <div className="text-xs text-zinc-500 font-mono truncate">{inc.actor}</div>
          </div>
          <Timestamp ms={inc.ts} />
        </button>
      ))}
    </div>
  );
}
