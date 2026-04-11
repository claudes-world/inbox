/**
 * Experiments Screen — stub discovery board for feature flags / A/B tests.
 * Hardcoded sample data for v1; API integration pending.
 */

type Status = "active" | "paused" | "completed";
type Experiment = {
  id: string; name: string; status: Status;
  variants: Array<{ name: string; pct: number }>;
  startedAt: string; metrics: Array<[string, string]>;
};

const STATUS_STYLES: Record<Status, string> = {
  active: "bg-emerald-900/40 text-emerald-400 border-emerald-800",
  paused: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  completed: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const EXPERIMENTS: Experiment[] = [
  { id: "exp-001", name: "Urgency badges", status: "active",
    variants: [{ name: "control", pct: 50 }, { name: "colored", pct: 50 }],
    startedAt: "2026-03-15", metrics: [["Messages sent", "1,247"], ["Ack rate", "42%"]] },
  { id: "exp-002", name: "Smart reply suggestions", status: "active",
    variants: [{ name: "off", pct: 33 }, { name: "three", pct: 33 }, { name: "five", pct: 34 }],
    startedAt: "2026-03-28", metrics: [["Replies sent", "389"], ["Suggestion CTR", "18%"]] },
  { id: "exp-003", name: "Thread collapse default", status: "paused",
    variants: [{ name: "expanded", pct: 50 }, { name: "collapsed", pct: 50 }],
    startedAt: "2026-02-10", metrics: [["Threads opened", "2,103"], ["Scroll depth", "64%"]] },
  { id: "exp-004", name: "Digest vs realtime", status: "completed",
    variants: [{ name: "realtime", pct: 50 }, { name: "digest", pct: 50 }],
    startedAt: "2026-01-05", metrics: [["Retention", "+7%"], ["Response time", "-12%"]] },
];

const VARIANT_BG = ["bg-blue-500", "bg-emerald-500", "bg-purple-500"];

export function ExperimentsScreen() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Experiments</h2>
        <span className="text-xs text-zinc-500">Feature flags & A/B tests</span>
      </div>
      <div className="px-4 py-2 text-xs text-yellow-500/80 bg-yellow-950/20 border-b border-zinc-800">
        Experimental — static data for v1, API integration pending
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {EXPERIMENTS.map((exp) => (
          <div key={exp.id} className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{exp.name}</h3>
                <div className="text-xs text-zinc-500 font-mono">{exp.id}</div>
              </div>
              <span className={`text-[0.65rem] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_STYLES[exp.status]}`}>{exp.status}</span>
            </div>
            <div className="mb-3">
              <div className="text-[0.65rem] text-zinc-500 uppercase mb-1">Variants</div>
              <div className="flex gap-1 h-2 rounded overflow-hidden">
                {exp.variants.map((v, i) => (
                  <div key={v.name} className={`h-full ${VARIANT_BG[i] ?? "bg-zinc-500"}`} style={{ width: `${v.pct}%` }} title={`${v.name}: ${v.pct}%`} />
                ))}
              </div>
              <div className="flex gap-3 mt-1 text-[0.65rem] text-zinc-400">
                {exp.variants.map((v) => <span key={v.name}>{v.name} ({v.pct}%)</span>)}
              </div>
            </div>
            <div className="text-xs text-zinc-500">Started {exp.startedAt}</div>
            <div className="mt-3 pt-3 border-t border-zinc-700 grid grid-cols-2 gap-2">
              {exp.metrics.map(([label, value]) => (
                <div key={label}>
                  <div className="text-[0.65rem] text-zinc-500 uppercase">{label}</div>
                  <div className="text-sm text-zinc-200 font-mono">{value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
