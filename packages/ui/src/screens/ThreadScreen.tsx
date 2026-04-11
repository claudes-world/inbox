/**
 * Thread Screen — shows full conversation with quick reply.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchThread, postReply } from "../api.js";
import { ThreadItem } from "../components/composites/ThreadItem.js";
import { Button } from "../components/primitives/Button.js";
import type { ThreadItem as ThreadItemType } from "@inbox/contracts";

export function ThreadScreen({
  address,
  conversationId,
  navigate,
}: {
  address: string;
  conversationId: string;
  navigate: (hash: string) => void;
}) {
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["thread", address, conversationId],
    queryFn: () => fetchThread(address, conversationId),
    enabled: !!address && !!conversationId,
  });

  // Get last message ID for quick reply
  const lastItem =
    data && data.items.length > 0
      ? data.items[data.items.length - 1]
      : undefined;
  const lastMessageId = lastItem?.message_id ?? null;

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!lastMessageId) throw new Error("No message to reply to");
      return postReply(address, lastMessageId, { body: replyBody });
    },
    onSuccess: () => {
      setReplyBody("");
      setReplyError("");
      queryClient.invalidateQueries({
        queryKey: ["thread", address, conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["inbox", address] });
    },
    onError: (err) => {
      setReplyError(err instanceof Error ? err.message : "Reply failed");
    },
  });

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>
          &larr; Inbox
        </Button>
        <span className="font-mono text-xs text-zinc-500 truncate">
          {conversationId}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading thread...</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load thread</span>
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
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span>No messages in this thread</span>
        </div>
      )}

      {/* Truncation notice */}
      {data && data.truncated && (
        <div className="px-4 py-2 text-xs text-yellow-500 bg-yellow-950/30 border-b border-zinc-800">
          Showing {data.returned_count} of {data.total_visible_count} messages
          (truncated)
        </div>
      )}

      {/* Messages */}
      {data &&
        data.items.map((item: ThreadItemType, idx: number) => (
          <div key={item.message_id}>
            <ThreadItem item={item} isLast={idx === data.items.length - 1} />
            {/* Clickable message ID to navigate to full read view */}
            <div className="px-4 pb-1">
              <button
                type="button"
                onClick={() => navigate(`/message/${item.message_id}`)}
                className="text-[0.6rem] font-mono text-zinc-700 hover:text-zinc-500 cursor-pointer"
              >
                Open full view
              </button>
            </div>
          </div>
        ))}

      {/* Quick reply */}
      {data && data.items.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Quick Reply
          </h3>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Type your reply..."
            rows={4}
            className="w-full bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm font-mono leading-relaxed focus:border-blue-500 focus:outline-none resize-y"
          />
          {replyError && (
            <div className="text-xs text-red-400">{replyError}</div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => replyMutation.mutate()}
              disabled={replyMutation.isPending || !replyBody.trim()}
            >
              {replyMutation.isPending ? "Sending..." : "Send Reply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
