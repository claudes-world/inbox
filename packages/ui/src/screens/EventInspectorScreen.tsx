/**
 * Event Inspector Screen — raw delivery event viewer for debugging.
 * Derives state-transition data from inbox list + message read history.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInbox, fetchMessage } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import type { ListItem, ReadResponse } from "@inbox/contracts";

interface DerivedEvent { timestamp_ms: number; message_id: string; event_type: string; from_state: string; to_state: string }

function deriveEvents(items: ListItem[], details: Map<string, ReadResponse>): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  for (const item of items) {
    events.push({ timestamp_ms: item.delivered_at_ms, message_id: item.message_id, event_type: "delivery", from_state: "—", to_state: item.engagement_state });
    const detail = details.get(item.message_id);
    if (detail?.history) {
      for (const raw of detail.history) {
        const evt = raw as Record<string, unknown>;
        if (typeof evt.event_at_ms === "number") {
          events.push({ timestamp_ms: evt.event_at_ms, message_id: item.message_id,
            event_type: String(evt.event_type ?? evt.change_kind ?? "unknown"),
            from_state: String(evt.from_state ?? "—"), to_state: String(evt.to_state ?? evt.change_kind ?? "—") });
        }
      }
    }
  }
  return events.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
}

export function EventInspectorScreen({ address, navigate }: { address: string; navigate: (h: string) => void }) {
  const [filterMsgId, setFilterMsgId] = useState("");
  const [filterType, setFilterType] = useState("");
  const { data: inbox, isLoading } = useQuery({
    queryKey: ["inbox", address, "events"], queryFn: () => fetchInbox(address), enabled: !!address,
  });
  const items = inbox?.items ?? [];
  const detailQ = useQuery({
    queryKey: ["event-details", address, items.map(i => i.message_id)],
    queryFn: async () => {
      const map = new Map<string, ReadResponse>();
      await Promise.all(items.slice(0, 20).map(async item => {
        try { map.set(item.message_id, await fetchMessage(address, item.message_id)); } catch { /* skip */ }
      }));
      return map;
    },
    enabled: items.length > 0,
  });
  const events = useMemo(() => deriveEvents(items, detailQ.data ?? new Map()), [items, detailQ.data]);
  const filtered = useMemo(() => {
    let r = events;
    if (filterMsgId) r = r.filter(e => e.message_id.toLowerCase().includes(filterMsgId.toLowerCase()));
    if (filterType) r = r.filter(e => e.event_type.toLowerCase().includes(filterType.toLowerCase()));
    return r;
  }, [events, filterMsgId, filterType]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>&larr; Inbox</Button>
        <span className="text-sm font-semibold text-zinc-300">Event Inspector</span>
        <div className="flex-1" />
        <span className="text-xs text-zinc-600">{filtered.length} events</span>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950/80">
        <input type="text" placeholder="Filter by message ID..." value={filterMsgId} onChange={e => setFilterMsgId(e.target.value)}
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs font-mono flex-1" />
        <input type="text" placeholder="Filter by event type..." value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs font-mono w-40" />
      </div>
      <div className="px-4 py-2 text-xs text-yellow-500 bg-yellow-950/20 border-b border-zinc-800">
        Derived from inbox list + message history. Full event stream requires a dedicated event API endpoint.
      </div>
      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading events...</span></div>}
      {!isLoading && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead><tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-950">
              <th className="text-left px-4 py-2">Timestamp</th><th className="text-left px-4 py-2">Message ID</th>
              <th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">From</th><th className="text-left px-4 py-2">To</th>
            </tr></thead>
            <tbody>
              {filtered.map((evt, i) => (
                <tr key={`${evt.message_id}-${evt.timestamp_ms}-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-1.5"><Timestamp ms={evt.timestamp_ms} /></td>
                  <td className="px-4 py-1.5">
                    <button type="button" onClick={() => navigate(`/message/${evt.message_id}`)}
                      className="text-zinc-400 hover:text-zinc-200 cursor-pointer">{evt.message_id.slice(0, 16)}...</button>
                  </td>
                  <td className="px-4 py-1.5 text-zinc-300">{evt.event_type}</td>
                  <td className="px-4 py-1.5 text-zinc-500">{evt.from_state}</td>
                  <td className="px-4 py-1.5 text-zinc-300">{evt.to_state}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">No events found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
