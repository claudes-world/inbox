/**
 * Feedback Board Screen — display feedback entries, filter by sentiment.
 * No feedback API on the BFF yet, so v1 uses sample data.
 */
import { useState, useMemo } from "react";

type Sentiment = "positive" | "neutral" | "negative";
type Feedback = { id: string; emoji: string; rating: number; sentiment: Sentiment; text: string; from: string; ms: number };

const STYLES: Record<Sentiment, string> = {
  positive: "border-emerald-800/60 bg-emerald-950/20",
  neutral: "border-zinc-700 bg-zinc-900",
  negative: "border-red-900/60 bg-red-950/20",
};

const H = 60 * 60 * 1000;
const SAMPLE: Feedback[] = [
  { id: "fb-001", emoji: "🙂", rating: 5, sentiment: "positive",
    text: "The thread view is exactly what I needed. Reading conversations in order finally makes sense.",
    from: "alice@team.local", ms: Date.now() - 2 * H },
  { id: "fb-002", emoji: "😐", rating: 3, sentiment: "neutral",
    text: "Directory works but feels sparse. Would love recent activity per person.",
    from: "bob@team.local", ms: Date.now() - 5 * H },
  { id: "fb-003", emoji: "😕", rating: 2, sentiment: "negative",
    text: "Compose flow loses draft when I navigate away. Lost a whole message yesterday.",
    from: "carol@team.local", ms: Date.now() - 18 * H },
  { id: "fb-004", emoji: "🙂", rating: 4, sentiment: "positive",
    text: "Hide action is great for cleaning up without deleting anything.",
    from: "dan@team.local", ms: Date.now() - 48 * H },
  { id: "fb-005", emoji: "😐", rating: 3, sentiment: "neutral",
    text: "Search would be nice. Scrolling to find older messages gets old fast.",
    from: "eve@team.local", ms: Date.now() - 72 * H },
];

export function FeedbackBoardScreen() {
  const [filter, setFilter] = useState<"all" | Sentiment>("all");
  const filtered = useMemo(
    () => (filter === "all" ? SAMPLE : SAMPLE.filter((f) => f.sentiment === filter)),
    [filter],
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Feedback</h2>
        <label className="text-xs text-zinc-500">
          Sentiment:
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="ml-1 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs">
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">{filtered.length} entries</span>
      </div>
      <div className="px-4 py-2 text-xs text-yellow-500/80 bg-yellow-950/20 border-b border-zinc-800">
        Sample data — no feedback API yet, will wire when BFF exposes one
      </div>
      {filtered.length === 0 && <div className="flex items-center justify-center py-12 text-zinc-500">No feedback entries</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
        {filtered.map((f) => (
          <div key={f.id} className={`rounded-lg p-4 border ${STYLES[f.sentiment]}`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">{f.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-zinc-200">{f.rating}/5</span>
                  <span className="text-[0.65rem] uppercase text-zinc-500">{f.sentiment}</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">{f.text}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                  <span className="font-mono truncate">{f.from}</span>
                  <span>{new Date(f.ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
