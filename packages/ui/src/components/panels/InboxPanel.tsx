import { useQuery } from "@tanstack/react-query";
import type { ListResponse } from "@inbox/contracts";
import { MessageRow } from "../composites/MessageRow.js";
import { Button } from "../primitives/Button.js";

async function fetchInbox(): Promise<ListResponse> {
  const res = await fetch("/api/inbox");
  if (!res.ok) throw new Error(`Inbox fetch failed: ${res.status}`);
  return res.json();
}

export function InboxPanel({
  onSelectThread,
}: {
  onSelectThread?: (conversationId: string) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <span className="animate-pulse">Loading inbox...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
        <span>Failed to load inbox</span>
        <span className="text-xs text-red-400 font-mono">
          {error instanceof Error ? error.message : "Unknown error"}
        </span>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
        <span>No messages</span>
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">
          {data.returned_count} message{data.returned_count !== 1 ? "s" : ""}
        </span>
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Message list */}
      <div className="flex flex-col">
        {data.items.map((item) => (
          <MessageRow
            key={item.delivery_id}
            item={item}
            onSelect={onSelectThread}
          />
        ))}
      </div>
    </div>
  );
}
