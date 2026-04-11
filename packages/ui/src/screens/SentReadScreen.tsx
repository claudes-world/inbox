/**
 * Sent Read Screen — shows full sent message detail.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchSentMessage, postSentHide, postSentUnhide } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Badge } from "../components/primitives/Badge.js";
import { RecipientList } from "../components/composites/RecipientList.js";

export function SentReadScreen({
  address,
  messageId,
  navigate,
}: {
  address: string;
  messageId: string;
  navigate: (hash: string) => void;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sent-message", address, messageId],
    queryFn: () => fetchSentMessage(address, messageId),
    enabled: !!address && !!messageId,
  });

  const hideMutation = useMutation({
    mutationFn: () => postSentHide(address, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sent-message", address, messageId],
      });
      queryClient.invalidateQueries({ queryKey: ["sent", address] });
    },
  });

  const unhideMutation = useMutation({
    mutationFn: () => postSentUnhide(address, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sent-message", address, messageId],
      });
      queryClient.invalidateQueries({ queryKey: ["sent", address] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <span className="animate-pulse">Loading message...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
        <span>Failed to load message</span>
        <span className="text-xs text-red-400 font-mono">
          {error instanceof Error ? error.message : "Unknown error"}
        </span>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
        <Button variant="ghost" onClick={() => navigate("/sent")}>
          Back to Sent
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { message: msg, state } = data;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/sent")}>
          &larr; Sent
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          onClick={() => navigate(`/thread/${msg.conversation_id}`)}
        >
          Thread
        </Button>
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        {/* Subject */}
        <h2 className="text-lg font-semibold text-zinc-100">{msg.subject}</h2>

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-300">From: {msg.sender}</span>
          <Badge variant="read">sent</Badge>
          {state.visibility_state === "hidden" && (
            <Badge variant="hidden">hidden</Badge>
          )}
        </div>

        {/* Recipients */}
        {(msg.public_to.length > 0 || msg.public_cc.length > 0) && (
          <RecipientList to={msg.public_to} cc={msg.public_cc} />
        )}

        {/* IDs */}
        <div className="text-[0.65rem] font-mono text-zinc-600 space-y-0.5">
          <div>message: {msg.message_id}</div>
          <div>conversation: {msg.conversation_id}</div>
          {msg.parent_message_id && (
            <div>parent: {msg.parent_message_id}</div>
          )}
        </div>

        {/* Body */}
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-zinc-950 border border-zinc-800 rounded p-3 max-h-[60vh] overflow-auto">
          {msg.body}
        </pre>

        {/* References */}
        {msg.references.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              References
            </h3>
            {msg.references.map((ref, i) => (
              <div
                key={i}
                className="text-xs font-mono text-zinc-400 bg-zinc-900 px-2 py-1 rounded"
              >
                <span className="text-zinc-500">{ref.kind}:</span>{" "}
                {ref.value}
                {ref.label && (
                  <span className="text-zinc-600 ml-2">({ref.label})</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          {state.visibility_state === "active" ? (
            <Button
              variant="secondary"
              onClick={() => hideMutation.mutate()}
              disabled={hideMutation.isPending}
            >
              {hideMutation.isPending ? "..." : "Hide"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => unhideMutation.mutate()}
              disabled={unhideMutation.isPending}
            >
              {unhideMutation.isPending ? "..." : "Unhide"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
