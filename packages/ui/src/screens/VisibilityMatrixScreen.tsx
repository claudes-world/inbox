/**
 * Visibility Matrix Screen — shows who can see what.
 * V1: limited to current identity's inbox + sent items.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInbox, fetchSent } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import type { ListItem, SentListItem } from "@inbox/contracts";

interface CellState { visible: boolean; engagement?: string; view_kind: "received" | "sent" }
interface MatrixRow { message_id: string; subject: string; timestamp_ms: number; cells: Record<string, CellState> }

function engagementColor(s?: string): string {
  if (s === "unread") return "text-blue-400 bg-blue-950/40";
  if (s === "read") return "text-zinc-400 bg-zinc-800/40";
  if (s === "acknowledged") return "text-green-400 bg-green-950/40";
  return "text-zinc-600";
}

function buildMatrix(address: string, inbox: ListItem[], sent: SentListItem[]) {
  const addrSet = new Set([address]);
  const rowMap = new Map<string, MatrixRow>();
  for (const item of inbox) {
    addrSet.add(item.sender);
    const row = rowMap.get(item.message_id) ?? { message_id: item.message_id, subject: item.subject, timestamp_ms: item.delivered_at_ms, cells: {} };
    row.cells[address] = { visible: item.visibility_state === "active", engagement: item.engagement_state, view_kind: "received" };
    rowMap.set(item.message_id, row);
  }
  for (const item of sent) {
    const row = rowMap.get(item.message_id) ?? { message_id: item.message_id, subject: item.subject, timestamp_ms: item.created_at_ms, cells: {} };
    row.cells[address] = { visible: item.visibility_state === "active", view_kind: "sent" };
    rowMap.set(item.message_id, row);
  }
  return { rows: Array.from(rowMap.values()).sort((a, b) => b.timestamp_ms - a.timestamp_ms), addresses: Array.from(addrSet) };
}

export function VisibilityMatrixScreen({ address, navigate }: { address: string; navigate: (h: string) => void }) {
  const { data: inboxData, isLoading: il } = useQuery({ queryKey: ["inbox", address, "matrix"], queryFn: () => fetchInbox(address), enabled: !!address });
  const { data: sentData, isLoading: sl } = useQuery({ queryKey: ["sent", address, "matrix"], queryFn: () => fetchSent(address), enabled: !!address });
  const isLoading = il || sl;
  const { rows, addresses } = useMemo(() => buildMatrix(address, inboxData?.items ?? [], sentData?.items ?? []), [address, inboxData, sentData]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>&larr; Inbox</Button>
        <span className="text-sm font-semibold text-zinc-300">Visibility Matrix</span>
        <div className="flex-1" />
        <span className="text-xs text-zinc-600">{rows.length} messages</span>
      </div>
      <div className="px-4 py-2 text-xs text-yellow-500 bg-yellow-950/20 border-b border-zinc-800">
        Showing {address} perspective only. Cross-address matrix requires admin API endpoint.
      </div>
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 text-xs">
        <span><span className="text-blue-400">✓</span> unread</span>
        <span><span className="text-zinc-400">✓</span> read</span>
        <span><span className="text-green-400">✓</span> ack</span>
        <span><span className="text-red-400">✗</span> hidden</span>
        <span><span className="text-zinc-600">—</span> n/a</span>
      </div>
      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading matrix...</span></div>}
      {!isLoading && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead><tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-950">
              <th className="text-left px-4 py-2 sticky left-0 bg-zinc-950">Message</th>
              <th className="text-left px-4 py-2">Time</th>
              {addresses.map(a => <th key={a} className="text-center px-3 py-2 max-w-[100px] truncate">{a.split("@")[0]}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.message_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-1.5 sticky left-0 bg-zinc-900">
                    <button type="button" onClick={() => navigate(`/message/${row.message_id}`)}
                      className="text-zinc-300 hover:text-zinc-100 cursor-pointer truncate block max-w-[200px]">
                      {row.subject || row.message_id.slice(0, 16)}
                    </button>
                  </td>
                  <td className="px-4 py-1.5"><Timestamp ms={row.timestamp_ms} /></td>
                  {addresses.map(a => {
                    const cell = row.cells[a];
                    return <td key={a} className={`text-center px-3 py-1.5 ${engagementColor(cell?.engagement)}`}>
                      {!cell ? "—" : cell.visible ? "✓" : "✗"}
                    </td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={2 + addresses.length} className="px-4 py-8 text-center text-zinc-600">No messages found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
