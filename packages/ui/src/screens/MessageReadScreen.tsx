/**
 * Message Read Screen — shows full message detail with actions.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMessage, postAck, postHide, postUnhide } from "../api.js";
import { Badge } from "../components/primitives/Badge.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";
import { RecipientList } from "../components/composites/RecipientList.js";
import type { BadgeVariant } from "../components/primitives/Badge.js";

export function MessageReadScreen({
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
    queryKey: ["message", address, messageId],
    queryFn: () => fetchMessage(address, messageId),
    enabled: !!address && !!messageId,
  });

  const ackMutation = useMutation({
    mutationFn: () => postAck(address, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message", address, messageId] });
      queryClient.invalidateQueries({ queryKey: ["inbox", address] });
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => postHide(address, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message", address, messageId] });
      queryClient.invalidateQueries({ queryKey: ["inbox", address] });
    },
  });

  const unhideMutation = useMutation({
    mutationFn: () => postUnhide(address, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message", address, messageId] });
      queryClient.invalidateQueries({ queryKey: ["inbox", address] });
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
        <Button variant="ghost" onClick={() => navigate("/")}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { message: msg, state, history } = data;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>
          &larr; Inbox
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          onClick={() => navigate(`/thread/${msg.conversation_id}`)}
        >
          Thread
        </Button>
        <Button
          variant="ghost"
          onClick={() => navigate(`/compose?reply=${messageId}`)}
        >
          Reply
        </Button>
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Message content */}
      <div className="px-4 py-4 space-y-4">
        {/* Subject */}
        <h2 className="text-lg font-semibold text-zinc-100">{msg.subject}</h2>

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-300">From: {msg.sender}</span>
          <Badge variant={state.engagement_state as BadgeVariant}>
            {state.engagement_state}
          </Badge>
          {state.visibility_state === "hidden" && (
            <Badge variant="hidden">hidden</Badge>
          )}
          <Badge variant={state.effective_role as BadgeVariant}>
            {state.effective_role}
          </Badge>
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
          {state.engagement_state !== "acknowledged" && (
            <Button
              variant="primary"
              onClick={() => ackMutation.mutate()}
              disabled={ackMutation.isPending}
            >
              {ackMutation.isPending ? "..." : "Acknowledge"}
            </Button>
          )}
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
          <Button
            variant="secondary"
            onClick={() => navigate(`/compose?reply=${messageId}`)}
          >
            Reply
          </Button>
        </div>

        {/* History */}
        {Array.isArray(history) && history.length > 0 && (
          <div className="space-y-1 pt-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Delivery History
            </h3>
            {history.map((rawEvt: unknown, i: number) => {
              const evt = rawEvt as Record<string, unknown>;
              return (
                <div
                  key={i}
                  className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded flex items-center gap-2"
                >
                  <span className="text-zinc-600">
                    {String(evt.event_type ?? "")}
                  </span>
                  <span>{String(evt.change_kind ?? "")}</span>
                  {typeof evt.event_at_ms === "number" && (
                    <Timestamp ms={evt.event_at_ms} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
