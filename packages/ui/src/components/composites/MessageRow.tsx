import type { ListItem } from "@inbox/contracts";
import { Badge } from "../primitives/Badge.js";
import { Timestamp } from "../primitives/Timestamp.js";
import type { BadgeVariant } from "../primitives/Badge.js";

function engagementBadge(state: string): BadgeVariant {
  if (state === "unread") return "unread";
  if (state === "acknowledged") return "acknowledged";
  return "read";
}

function roleBadge(role: string): BadgeVariant {
  if (role === "cc") return "cc";
  if (role === "bcc") return "bcc";
  return "to";
}

export function MessageRow({
  item,
  onSelect,
}: {
  item: ListItem;
  onSelect?: (conversationId: string) => void;
}) {
  const isUnread = item.engagement_state === "unread";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.conversation_id)}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-zinc-800 transition-colors cursor-pointer ${
        isUnread
          ? "bg-zinc-900 hover:bg-zinc-800"
          : "bg-zinc-950 hover:bg-zinc-900"
      }`}
    >
      {/* Left: sender + subject */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-sm truncate ${isUnread ? "font-semibold text-zinc-100" : "text-zinc-300"}`}
          >
            {item.sender}
          </span>
          <Badge variant={roleBadge(item.effective_role)}>
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
      </div>

      {/* Right: state + timestamp */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge variant={engagementBadge(item.engagement_state)}>
          {item.engagement_state}
        </Badge>
        <Timestamp ms={item.delivered_at_ms} />
        {item.visibility_state === "hidden" && (
          <Badge variant="hidden">hidden</Badge>
        )}
      </div>
    </button>
  );
}
