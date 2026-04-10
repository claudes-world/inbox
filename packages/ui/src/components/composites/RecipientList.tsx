import type { AddressKind } from "@inbox/contracts";
import { AddressChip } from "../primitives/AddressChip.js";
import { Badge } from "../primitives/Badge.js";

interface RecipientGroup {
  role: "to" | "cc";
  addresses: string[];
}

/**
 * Resolve address kind from the address string.
 * Uses a heuristic: @lists -> list, @svc -> service, otherwise agent.
 * In a real app this would come from the directory API.
 */
function inferKind(address: string): AddressKind {
  if (address.includes("@lists")) return "list";
  if (address.includes("@svc")) return "service";
  // Default to agent for the operator console context
  return "agent";
}

export function RecipientList({
  to,
  cc,
}: {
  to: string[];
  cc?: string[];
}) {
  const groups: RecipientGroup[] = [];
  if (to.length > 0) groups.push({ role: "to", addresses: to });
  if (cc && cc.length > 0) groups.push({ role: "cc", addresses: cc });

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <div key={group.role} className="flex items-start gap-2 flex-wrap">
          <Badge variant={group.role}>{group.role.toUpperCase()}</Badge>
          {group.addresses.map((addr) => (
            <AddressChip
              key={addr}
              address={addr}
              kind={inferKind(addr)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
