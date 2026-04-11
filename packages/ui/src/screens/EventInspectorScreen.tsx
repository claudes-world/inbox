/**
 * Event Inspector Screen — raw delivery event viewer backed by GET /api/events.
 * Filters (message_id, event_type) are applied server-side via query params.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";

const EVENT_TYPES = ["delivered", "read", "acknowledged", "replied", "hidden", "restored", "failed"] as const;

export function EventInspectorScreen({ address, navigate }: { address: string; navigate: (h: string) => void }) {
  const [filterMsgId, setFilterMsgId] = useState("");
  const [filterType, setFilterType] = useState("");
  // Debounce message_id to avoid a request per keystroke.
  const [queryMsgId, setQueryMsgId] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["events", address, queryMsgId, filterType],
    queryFn: () => fetchEvents(address, {
      message_id: queryMsgId || undefined,
      event_type: filterType || undefined,
      limit: 200,
    }),
    enabled: !!address,
  });
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>&larr; Inbox</Button>
        <span className="text-sm font-semibold text-zinc-300">Event Inspector</span>
        <span className="text-xs text-zinc-600">Live · /api/events</span>
        <div className="flex-1" />
        <span className="text-xs text-zinc-600">{items.length} events</span>
        <Button variant="ghost" onClick={() => refetch()}>Refresh</Button>
      </div>
      <form
        className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950/80"
        onSubmit={(e) => { e.preventDefault(); setQueryMsgId(filterMsgId.trim()); }}
      >
        <input
          type="text" placeholder="Filter by exact message ID (press Enter)..."
          value={filterMsgId} onChange={e => setFilterMsgId(e.target.value)}
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs font-mono flex-1"
        />
        <select
          value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs w-40"
        >
          <option value="">All event types</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </form>
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading events...</span>
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load events</span>
          <span className="text-xs text-red-400 font-mono">
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
          <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      )}
      {!isLoading && !isError && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead><tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-950">
              <th className="text-left px-4 py-2">Timestamp</th>
              <th className="text-left px-4 py-2">Event ID</th>
              <th className="text-left px-4 py-2">Message</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Actor</th>
              <th className="text-left px-4 py-2">From</th>
              <th className="text-left px-4 py-2">To</th>
            </tr></thead>
            <tbody>
              {items.map((evt) => (
                <tr key={evt.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-1.5"><Timestamp ms={evt.created_ts} /></td>
                  <td className="px-4 py-1.5 text-zinc-500">{evt.id.slice(0, 14)}...</td>
                  <td className="px-4 py-1.5">
                    <button type="button" onClick={() => navigate(`/message/${evt.message_id}`)}
                      className="text-zinc-400 hover:text-zinc-200 cursor-pointer">{evt.message_id.slice(0, 16)}...</button>
                  </td>
                  <td className="px-4 py-1.5 text-zinc-300">{evt.event_type}</td>
                  <td className="px-4 py-1.5 text-zinc-500 truncate max-w-[12rem]">{evt.actor_address}</td>
                  <td className="px-4 py-1.5 text-zinc-500">{evt.from_state ?? "—"}</td>
                  <td className="px-4 py-1.5 text-zinc-300">{evt.to_state}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  No delivery events found for the current filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
