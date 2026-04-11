/** Search Screen — client-side search across inbox and sent messages. */
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ListItem, SentListItem } from "@inbox/contracts";
import { fetchInbox, fetchSent } from "../api.js";
import { Timestamp } from "../components/primitives/Timestamp.js";

type Hit = { kind: "inbox"; item: ListItem } | { kind: "sent"; item: SentListItem };

export function SearchScreen({ address, navigate }: { address: string; navigate: (hash: string) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const inboxQ = useQuery({
    queryKey: ["inbox", address, "any", "any"],
    queryFn: () => fetchInbox(address, { state: "any", visibility: "any" }),
    enabled: !!address,
  });
  const sentQ = useQuery({
    queryKey: ["sent", address, "any"],
    queryFn: () => fetchSent(address, { visibility: "any" }),
    enabled: !!address,
  });
  const isLoading = inboxQ.isLoading || sentQ.isLoading;

  const results: Hit[] = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return [];
    const hits: Hit[] = [];
    for (const item of inboxQ.data?.items ?? [])
      if ([item.subject, item.body_preview, item.sender].some((f) => f.toLowerCase().includes(q)))
        hits.push({ kind: "inbox", item });
    for (const item of sentQ.data?.items ?? [])
      if (item.subject.toLowerCase().includes(q)) hits.push({ kind: "sent", item });
    return hits;
  }, [debounced, inboxQ.data, sentQ.data]);

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <span className="animate-pulse">Loading messages...</span>
        </div>
      )}

      {!isLoading && debounced.trim() && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
          <span>No results for &ldquo;{debounced}&rdquo;</span>
        </div>
      )}

      {!debounced.trim() && !isLoading && (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
          <span>Type to search across inbox and sent messages</span>
        </div>
      )}

      {results.map((r) => {
        const { message_id: id, subject } = r.item;
        const tsMs = r.kind === "inbox" ? r.item.delivered_at_ms : r.item.created_at_ms;
        const route = r.kind === "inbox" ? `/message/${id}` : `/sent/${id}`;
        return (
          <button key={`${r.kind}-${id}`} type="button" onClick={() => navigate(route)}
            className="w-full text-left px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-zinc-200 truncate">
                {r.kind === "inbox" ? r.item.sender : "You"}
              </span>
              <span className="text-[0.6rem] text-zinc-600 uppercase">{r.kind}</span>
              <div className="flex-1" />
              <Timestamp ms={tsMs} />
            </div>
            <div className="text-sm text-zinc-300 truncate">{subject || "(no subject)"}</div>
            {r.kind === "inbox" && <div className="text-xs text-zinc-600 truncate mt-0.5">{r.item.body_preview}</div>}
          </button>
        );
      })}
    </div>
  );
}
