/**
 * Sent Screen — lists sent messages with hide/unhide actions.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SentListItem } from "@inbox/contracts";
import { fetchSent, postSentHide, postSentUnhide } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import { Badge } from "../components/primitives/Badge.js";

export function SentScreen({
  address,
  navigate,
}: {
  address: string;
  navigate: (hash: string) => void;
}) {
  const queryClient = useQueryClient();
  const [visFilter, setVisFilter] = useState("active");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sent", address, visFilter],
    queryFn: () => fetchSent(address, { visibility: visFilter }),
    enabled: !!address,
  });

  const hideMutation = useMutation({
    mutationFn: (msgId: string) => postSentHide(address, msgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sent", address] }),
  });

  const unhideMutation = useMutation({
    mutationFn: (msgId: string) => postSentUnhide(address, msgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sent", address] }),
  });

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
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
            {data.returned_count} sent
          </span>
        )}
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading sent messages...</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load sent messages</span>
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
          <span>No sent messages</span>
        </div>
      )}

      {/* Sent list */}
      {data &&
        data.items.map((item: SentListItem) => (
          <div
            key={item.message_id}
            className="px-4 py-3 flex items-start gap-3 border-b border-zinc-800 bg-zinc-950 hover:bg-zinc-900 transition-colors"
          >
            <button
              type="button"
              onClick={() => navigate(`/sent/${item.message_id}`)}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <div className="text-sm text-zinc-300 truncate">
                {item.subject || "(no subject)"}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[0.65rem] text-zinc-600 truncate">
                  {item.conversation_id}
                </span>
              </div>
            </button>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Timestamp ms={item.created_at_ms} />
              {item.visibility_state === "hidden" && (
                <Badge variant="hidden">hidden</Badge>
              )}
              <div className="flex items-center gap-1 mt-1">
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigate(`/thread/${item.conversation_id}`)
                  }
                >
                  Thread
                </Button>
                {item.visibility_state === "active" ? (
                  <Button
                    variant="ghost"
                    onClick={() => hideMutation.mutate(item.message_id)}
                  >
                    Hide
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => unhideMutation.mutate(item.message_id)}
                  >
                    Show
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
