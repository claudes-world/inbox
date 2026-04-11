import type { ThreadItem as ThreadItemType } from "@inbox/contracts";
import { Badge } from "../primitives/Badge.js";
import { Timestamp } from "../primitives/Timestamp.js";
import type { BadgeVariant } from "../primitives/Badge.js";

function viewBadge(item: ThreadItemType): { variant: BadgeVariant; label: string } | null {
  if (item.view_kind === "received" && item.engagement_state) {
    return {
      variant: item.engagement_state as BadgeVariant,
      label: item.engagement_state,
    };
  }
  return null;
}

export function ThreadItem({
  item,
  isLast,
}: {
  item: ThreadItemType;
  isLast?: boolean;
}) {
  const badge = viewBadge(item);
  const isSent = item.view_kind === "sent";

  return (
    <div
      className={`px-4 py-3 ${isLast ? "" : "border-b border-zinc-800"} ${
        isSent ? "bg-zinc-950" : "bg-zinc-900"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-zinc-200 truncate">
          {item.sender}
        </span>
        {isSent && (
          <span className="text-[0.65rem] text-zinc-600 uppercase tracking-wider">
            sent
          </span>
        )}
        {item.effective_role && (
          <Badge variant={item.effective_role as BadgeVariant}>
            {item.effective_role}
          </Badge>
        )}
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        <div className="flex-1" />
        <Timestamp ms={item.created_at_ms} />
      </div>

      {/* Subject */}
      <div className="text-sm text-zinc-300 truncate">{item.subject}</div>

      {/* Body preview or full body */}
      {item.body ? (
        <pre className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-auto">
          {item.body}
        </pre>
      ) : item.body_preview ? (
        <div className="text-xs text-zinc-500 mt-1 truncate">
          {item.body_preview}
        </div>
      ) : null}

      {/* Message ID */}
      <div className="mt-1">
        <span className="font-mono text-[0.6rem] text-zinc-700">
          {item.message_id}
        </span>
      </div>
    </div>
  );
}
