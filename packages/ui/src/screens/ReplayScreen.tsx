/**
 * Replay Screen — timeline scrubber for replaying message flow across time.
 * Native range input + setInterval playback (no animation library).
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInbox, fetchSent } from "../api.js";
import { Button } from "../components/primitives/Button.js";
import { Timestamp } from "../components/primitives/Timestamp.js";

type TEvent = { id: string; kind: "received" | "sent"; subject: string; who: string; ms: number };

export function ReplayScreen({ address }: { address: string }) {
  const inbox = useQuery({
    queryKey: ["replay-inbox", address],
    queryFn: () => fetchInbox(address, { state: "any", visibility: "any" }),
    enabled: !!address,
  });
  const sent = useQuery({
    queryKey: ["replay-sent", address],
    queryFn: () => fetchSent(address, { visibility: "any" }),
    enabled: !!address,
  });

  const events: TEvent[] = useMemo(() => {
    const rx = (inbox.data?.items ?? []).map<TEvent>((m) => ({
      id: `in:${m.delivery_id}`, kind: "received", subject: m.subject, who: m.sender, ms: m.delivered_at_ms,
    }));
    const tx = (sent.data?.items ?? []).map<TEvent>((m) => ({
      id: `out:${m.message_id}`, kind: "sent", subject: m.subject, who: "you", ms: m.created_at_ms,
    }));
    return [...rx, ...tx].sort((a, b) => a.ms - b.ms);
  }, [inbox.data, sent.data]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setIdx(Math.max(events.length - 1, 0)); }, [events.length]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setIdx((p) => {
        if (p >= events.length - 1) { setPlaying(false); return p; }
        return p + 1;
      });
    }, 500);
    return () => clearInterval(t);
  }, [playing, events.length]);

  const isLoading = inbox.isLoading || sent.isLoading;
  const visible = events.slice(0, idx + 1);
  const currentMs = events[idx]?.ms;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Replay</h2>
        <span className="text-xs text-zinc-500">Timeline scrubber</span>
        <div className="flex-1" />
        {events.length > 0 && <span className="text-xs text-zinc-500">{visible.length} / {events.length}</span>}
      </div>

      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading timeline...</span></div>}
      {!isLoading && events.length === 0 && <div className="flex items-center justify-center py-12 text-zinc-500">No messages to replay</div>}

      {!isLoading && events.length > 0 && (
        <>
          <div className="px-4 py-4 border-b border-zinc-800 space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Button>
              <Button variant="ghost" onClick={() => setIdx(0)}>Reset</Button>
              {currentMs !== undefined && (
                <span className="text-xs text-zinc-400 font-mono">
                  {new Date(currentMs).toLocaleString("en-US", { timeZone: "America/New_York" })}
                </span>
              )}
            </div>
            <input
              type="range" min={0} max={events.length - 1} value={idx}
              onChange={(e) => setIdx(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="relative h-4">
              {events.map((ev, i) => (
                <div
                  key={ev.id}
                  className={`absolute top-1 w-2 h-2 rounded-full -translate-x-1/2 transition-colors ${
                    i <= idx ? (ev.kind === "sent" ? "bg-emerald-500" : "bg-blue-500") : "bg-zinc-700"
                  }`}
                  style={{ left: `${(i / Math.max(events.length - 1, 1)) * 100}%` }}
                  title={ev.subject}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            {[...visible].reverse().map((ev) => (
              <div key={ev.id} className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
                <span className={`text-[0.65rem] font-semibold uppercase w-16 ${ev.kind === "sent" ? "text-emerald-400" : "text-blue-400"}`}>{ev.kind}</span>
                <span className="text-sm text-zinc-300 truncate flex-1">{ev.subject}</span>
                <span className="text-xs text-zinc-500 font-mono truncate max-w-[160px]">{ev.who}</span>
                <Timestamp ms={ev.ms} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
