/**
 * Graph data aggregation hook.
 *
 * Fetches directory (nodes) and inbox for each address (edges),
 * then aggregates into a communication graph structure.
 */
import { useQuery, useQueries } from "@tanstack/react-query";
import type { AddressSummary } from "@inbox/contracts";
import { fetchDirectory, fetchInbox } from "../api.js";

export interface GraphEdge {
  from: string;
  to: string;
  count: number;
}

export interface GraphData {
  nodes: AddressSummary[];
  edges: GraphEdge[];
  isLoading: boolean;
  isError: boolean;
}

export function useGraphData(): GraphData {
  const {
    data: directoryData,
    isLoading: dirLoading,
    isError: dirError,
  } = useQuery({
    queryKey: ["directory"],
    queryFn: fetchDirectory,
  });

  const addresses = directoryData?.items ?? [];

  // Fetch inbox for each address to discover sender->recipient edges
  const inboxQueries = useQueries({
    queries: addresses.map((addr) => ({
      queryKey: ["graph-inbox", addr.address],
      queryFn: () => fetchInbox(addr.address),
      enabled: addresses.length > 0,
    })),
  });

  const inboxLoading = inboxQueries.some((q) => q.isLoading);
  const inboxError = inboxQueries.some((q) => q.isError);

  // Aggregate edges: sender -> recipient with counts
  const edgeMap = new Map<string, number>();
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    if (!addr) continue;
    const recipient = addr.address;
    const inboxData = inboxQueries[i]?.data;
    if (!inboxData) continue;
    for (const item of inboxData.items) {
      const key = `${item.sender}|${recipient}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  const edges: GraphEdge[] = [];
  for (const [key, count] of edgeMap) {
    const parts = key.split("|");
    const from = parts[0] ?? "";
    const to = parts[1] ?? "";
    if (from && to) edges.push({ from, to, count });
  }

  return {
    nodes: addresses,
    edges,
    isLoading: dirLoading || inboxLoading,
    isError: dirError || inboxError,
  };
}
