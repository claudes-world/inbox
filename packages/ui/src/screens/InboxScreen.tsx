/**
 * Inbox Screen — lists received messages with filter controls and actions.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ListItem } from "@inbox/contracts";
import { fetchInbox, postAck, postHide, postUnhide } from "../api.js";
import { Badge } from "../components/primitives/Badge.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import type { BadgeVariant } from "../components/primitives/Badge.js";

function engagementBadge(state: string): BadgeVariant {
  if (state === "unread") return "unread";
  if (state === "acknowledged") return "acknowledged";
  return "read";
}

export function InboxScreen({
  address,
  navigate,
}: {
  address: string;
  navigate: (hash: string) => void;
}) {
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState("any");
  const [visFilter, setVisFilter] = useState("active");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inbox", address, stateFilter, visFilter],
    queryFn: () =>
      fetchInbox(address, { state: stateFilter, visibility: visFilter }),
    enabled: !!address,
  });

  const ackMutation = useMutation({
    mutationFn: (msgId: string) => postAck(address, msgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inbox", address] }),
  });

  const hideMutation = useMutation({
    mutationFn: (msgId: string) => postHide(address, msgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inbox", address] }),
  });

  const unhideMutation = useMutation({
    mutationFn: (msgId: string) => postUnhide(address, msgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inbox", address] }),
  });

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <label className="text-xs text-zinc-500">
          State:
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="ml-1 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs"
          >
            <option value="any">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Visibility:
          <select
            value={visFilter}
            onChange={(e) => setVisFilter(e.target.value)}
            className="ml-1 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs"
          >
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="any">All</option>
          </select>
        </label>
        <div className="flex-1" />
        {data && (
          <span className="text-xs text-zinc-500">
            {data.returned_count} message
            {data.returned_count !== 1 ? "s" : ""}
          </span>
        )}
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading inbox...</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load inbox</span>
          <span className="text-xs text-red-400 font-mono">
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
          <span>No messages</span>
        </div>
      )}

      {/* Message list */}
      {data &&
        data.items.map((item: ListItem) => (
          <InboxRow
            key={item.delivery_id}
            item={item}
            onRead={() => navigate(`/message/${item.message_id}`)}
            onThread={() => navigate(`/thread/${item.conversation_id}`)}
            onAck={() => ackMutation.mutate(item.message_id)}
            onHide={() => hideMutation.mutate(item.message_id)}
            onUnhide={() => unhideMutation.mutate(item.message_id)}
          />
        ))}
    </div>
  );
}

function InboxRow({
  item,
  onRead,
  onThread,
  onAck,
  onHide,
  onUnhide,
}: {
  item: ListItem;
  onRead: () => void;
  onThread: () => void;
  onAck: () => void;
  onHide: () => void;
  onUnhide: () => void;
}) {
  const isUnread = item.engagement_state === "unread";

  return (
    <div
      className={`px-4 py-3 flex items-start gap-3 border-b border-zinc-800 transition-colors ${
        isUnread
          ? "bg-zinc-900 hover:bg-zinc-800"
          : "bg-zinc-950 hover:bg-zinc-900"
      }`}
    >
      {/* Left: sender + subject + preview */}
      <button
        type="button"
        onClick={onRead}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-sm truncate ${isUnread ? "font-semibold text-zinc-100" : "text-zinc-300"}`}
          >
            {item.sender}
          </span>
          <Badge variant={item.effective_role as BadgeVariant}>
            {item.effective_role}
          </Badge>
        </div>
        <div
          className={`text-sm truncate ${isUnread ? "text-zinc-200" : "text-zinc-400"}`}
        >
          {item.subject}
        </div>
        <div className="text-xs text-zinc-600 truncate mt-0.5">
          {item.body_preview}
        </div>
      </button>

      {/* Right: state + actions */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge variant={engagementBadge(item.engagement_state)}>
          {item.engagement_state}
        </Badge>
        <Timestamp ms={item.delivered_at_ms} />
        {item.visibility_state === "hidden" && (
          <Badge variant="hidden">hidden</Badge>
        )}
        <div className="flex items-center gap-1 mt-1">
          <Button variant="ghost" onClick={onThread}>
            Thread
          </Button>
          {item.engagement_state !== "acknowledged" && (
            <Button variant="ghost" onClick={onAck}>
              Ack
            </Button>
          )}
          {item.visibility_state === "active" ? (
            <Button variant="ghost" onClick={onHide}>
              Hide
            </Button>
          ) : (
            <Button variant="ghost" onClick={onUnhide}>
              Show
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
