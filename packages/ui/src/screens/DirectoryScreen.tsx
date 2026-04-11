/**
 * Directory Screen — lists all addresses with detail expansion.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AddressSummary } from "@inbox/contracts";
import { fetchDirectory, fetchDirectoryMembers } from "../api.js";
import { AddressChip } from "../components/primitives/AddressChip.js";
import { Badge } from "../components/primitives/Badge.js";
import { Button } from "../components/primitives/Button.js";
import type { AddressKind } from "@inbox/contracts";

function KindIcon({ kind }: { kind: string }) {
  const icons: Record<string, string> = {
    agent: "\u{1F916}",
    human: "\u{1F464}",
    service: "\u2699\uFE0F",
    list: "\u{1F4CB}",
  };
  return <span>{icons[kind] ?? "\u{1F4E8}"}</span>;
}

function DirectoryEntry({ item }: { item: AddressSummary }) {
  const [expanded, setExpanded] = useState(false);

  const isList = item.kind === "list";

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["directory-members", item.address],
    queryFn: () => fetchDirectoryMembers(item.address),
    enabled: expanded && isList,
  });

  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-zinc-900 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <KindIcon kind={item.kind} />
          <span className="text-sm font-medium text-zinc-200">
            {item.display_name ?? item.address}
          </span>
          {item.display_name && (
            <span className="text-xs font-mono text-zinc-500">
              {item.address}
            </span>
          )}
          <div className="flex-1" />
          <Badge variant={item.is_active ? "read" : "hidden"}>
            {item.is_active ? "active" : "inactive"}
          </Badge>
          {isList && (
            <Badge variant="cc">list</Badge>
          )}
          {!item.is_listed && (
            <span className="text-[0.6rem] text-zinc-600">unlisted</span>
          )}
        </div>
        {item.description && (
          <div className="text-xs text-zinc-500 mt-0.5 ml-6">
            {item.description}
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 ml-6 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-zinc-500">Kind</span>
            <span className="text-zinc-300">{item.kind}</span>
            <span className="text-zinc-500">Address</span>
            <span className="text-zinc-300 font-mono">{item.address}</span>
            <span className="text-zinc-500">Active</span>
            <span className="text-zinc-300">
              {item.is_active ? "yes" : "no"}
            </span>
            <span className="text-zinc-500">Listed</span>
            <span className="text-zinc-300">
              {item.is_listed ? "yes" : "no"}
            </span>
            {item.classification && (
              <>
                <span className="text-zinc-500">Classification</span>
                <span className="text-zinc-300">{item.classification}</span>
              </>
            )}
          </div>

          {/* Members for list addresses */}
          {isList && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Members
              </h4>
              {membersLoading && (
                <span className="text-xs text-zinc-600 animate-pulse">
                  Loading members...
                </span>
              )}
              {membersData && membersData.members.length === 0 && (
                <span className="text-xs text-zinc-600">No members</span>
              )}
              {membersData && (
                <div className="flex flex-wrap gap-1">
                  {membersData.members.map((member) => (
                    <AddressChip
                      key={member}
                      address={member}
                      kind={"agent" as AddressKind}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DirectoryScreen({
  navigate: _navigate,
}: {
  address: string;
  navigate: (hash: string) => void;
}) {
  const [kindFilter, setKindFilter] = useState<string>("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["directory"],
    queryFn: fetchDirectory,
  });

  const filteredItems =
    data?.items.filter(
      (item) => kindFilter === "all" || item.kind === kindFilter,
    ) ?? [];

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <label className="text-xs text-zinc-500">
          Kind:
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="ml-1 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="agent">Agent</option>
            <option value="human">Human</option>
            <option value="service">Service</option>
            <option value="list">List</option>
          </select>
        </label>
        <div className="flex-1" />
        {data && (
          <span className="text-xs text-zinc-500">
            {filteredItems.length} address
            {filteredItems.length !== 1 ? "es" : ""}
          </span>
        )}
        <Button variant="ghost" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading directory...</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>Failed to load directory</span>
          <span className="text-xs text-red-400 font-mono">
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {data && filteredItems.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
          <span>No addresses found</span>
        </div>
      )}

      {/* Directory list */}
      {filteredItems.map((item) => (
        <DirectoryEntry key={item.address} item={item} />
      ))}
    </div>
  );
}
