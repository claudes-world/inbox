/**
 * Thread Tree Screen — message hierarchy as an indented tree.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchThread } from "../api.js";
import { Badge } from "../components/primitives/Badge.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import type { ThreadItem as ThreadItemType } from "@inbox/contracts";
import type { BadgeVariant } from "../components/primitives/Badge.js";

interface TreeNode { item: ThreadItemType; children: TreeNode[]; depth: number }

function buildTree(items: ThreadItemType[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const item of items) byId.set(item.message_id, { item, children: [], depth: 0 });
  for (const item of items) {
    const node = byId.get(item.message_id)!;
    const parent = item.parent_message_id ? byId.get(item.parent_message_id) : undefined;
    parent ? parent.children.push(node) : roots.push(node);
  }
  (function setD(n: TreeNode, d: number) { n.depth = d; n.children.forEach(c => setD(c, d + 1)); });
  roots.forEach(r => (function setD(n: TreeNode, d: number) { n.depth = d; n.children.forEach(c => setD(c, d + 1)); })(r, 0));
  return roots;
}

function NodeRow({ node, collapsed, onToggle, navigate }: {
  node: TreeNode; collapsed: Set<string>; onToggle: (id: string) => void; navigate: (h: string) => void;
}) {
  const { item, children, depth } = node;
  const isCollapsed = collapsed.has(item.message_id);
  const snippet = item.body_preview ?? item.body?.slice(0, 60) ?? "";
  return (
    <>
      <div className="flex items-center gap-2 py-2 border-b border-zinc-800 hover:bg-zinc-800/50"
        style={{ paddingLeft: `${depth * 24 + 16}px`, paddingRight: 16 }}>
        {children.length > 0 ? (
          <button type="button" onClick={() => onToggle(item.message_id)}
            className="text-zinc-500 hover:text-zinc-300 w-4 text-center cursor-pointer text-xs">
            {isCollapsed ? "+" : "-"}
          </button>
        ) : <span className="w-4 text-center text-zinc-700 text-xs">·</span>}
        <button type="button" onClick={() => navigate(`/message/${item.message_id}`)}
          className="flex-1 flex items-center gap-2 text-left cursor-pointer min-w-0">
          <span className="text-sm text-zinc-300 truncate flex-shrink-0 max-w-[120px]">{item.sender}</span>
          <span className="text-xs text-zinc-500 truncate flex-1 min-w-0">
            {item.subject}{snippet ? ` — ${snippet}` : ""}
          </span>
        </button>
        {item.engagement_state && (
          <Badge variant={item.engagement_state as BadgeVariant}>{item.engagement_state}</Badge>
        )}
        <Timestamp ms={item.created_at_ms} />
      </div>
      {!isCollapsed && children.map(c => (
        <NodeRow key={c.item.message_id} node={c} collapsed={collapsed} onToggle={onToggle} navigate={navigate} />
      ))}
    </>
  );
}

export function ThreadTreeScreen({ address, conversationId, navigate }: {
  address: string; conversationId: string; navigate: (hash: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["thread", address, conversationId],
    queryFn: () => fetchThread(address, conversationId),
    enabled: !!address && !!conversationId,
  });
  const tree = useMemo(() => (data ? buildTree(data.items) : []), [data]);
  const onToggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>&larr; Inbox</Button>
        <span className="font-mono text-xs text-zinc-500 truncate">{conversationId}</span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => navigate(`/thread/${conversationId}`)}>Chronological</Button>
        <Button variant="ghost" onClick={() => refetch()}>Refresh</Button>
      </div>
      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading tree...</span></div>}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load thread</span>
          <span className="text-xs text-red-400 font-mono">{error instanceof Error ? error.message : "Unknown error"}</span>
          <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      )}
      {data && data.items.length === 0 && <div className="flex items-center justify-center py-12 text-zinc-500">No messages in this thread</div>}
      {tree.map(root => <NodeRow key={root.item.message_id} node={root} collapsed={collapsed} onToggle={onToggle} navigate={navigate} />)}
    </div>
  );
}
