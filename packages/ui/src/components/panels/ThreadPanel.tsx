import { useQuery } from "@tanstack/react-query";
import type { ThreadResponse } from "@inbox/contracts";
import { ThreadItem } from "../composites/ThreadItem.js";
import { Button } from "../primitives/Button.js";

async function fetchThread(conversationId: string): Promise<ThreadResponse> {
  const res = await fetch(`/api/thread/${conversationId}?full=1`);
  if (!res.ok) throw new Error(`Thread fetch failed: ${res.status}`);
  return res.json();
}

export function ThreadPanel({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack?: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["thread", conversationId],
    queryFn: () => fetchThread(conversationId),
    enabled: !!conversationId,
  });

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            &larr; Back
          </Button>
        )}
        <span className="font-mono text-xs text-zinc-500 truncate">
          {conversationId}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading thread...</span>
        </div>
      )}

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

      {data && data.items.length === 0 && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span>No messages in this thread</span>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          {data.truncated && (
            <div className="px-4 py-2 text-xs text-yellow-500 bg-yellow-950/30 border-b border-zinc-800">
              Showing {data.returned_count} of {data.total_visible_count}{" "}
              messages (truncated)
            </div>
          )}
          <div className="flex flex-col">
            {data.items.map((item, idx) => (
              <ThreadItem
                key={item.message_id}
                item={item}
                isLast={idx === data.items.length - 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
