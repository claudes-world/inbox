/**
 * Communication Graph Screen — matrix heatmap, force-directed, and ego view.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter,
  type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import { useGraphData, type GraphEdge } from "../hooks/useGraphData.js";
import type { AddressSummary } from "@inbox/contracts";

type Mode = "matrix" | "force" | "ego";
const W = 700, H = 500;
const KIND_COLOR: Record<string, string> = {
  agent: "#3b82f6", human: "#22c55e", service: "#eab308", list: "#a855f7",
};

const ini = (a: AddressSummary) => {
  if (a.display_name) return a.display_name.split(/[\s-]+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  return (a.address.split("@")[0] ?? "").slice(0, 2).toUpperCase();
};
const lbl = (a: AddressSummary) => a.display_name ?? a.address.split("@")[0] ?? a.address;

function pairCount(edges: GraphEdge[], a: string, b: string) {
  let t = 0;
  for (const e of edges) if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) t += e.count;
  return t;
}
function maxCount(edges: GraphEdge[]) {
  let m = 0; for (const e of edges) if (e.count > m) m = e.count; return m || 1;
}

/** Reusable SVG circle-node with initials */
function SvgNode({ x, y, addr, r = 20, bold = false, onMouseDown }: {
  x: number; y: number; addr: AddressSummary; r?: number; bold?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  const c = KIND_COLOR[addr.kind] ?? "#71717a";
  return (
    <g transform={`translate(${x},${y})`} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: "grab" } : undefined}>
      <circle r={r} fill="#18181b" stroke={c} strokeWidth={bold ? 3 : 2.5} />
      <text textAnchor="middle" dy="0.35em" fill={bold ? "#fafafa" : "#e4e4e7"}
        fontSize={bold ? 13 : 11} fontWeight={bold ? 700 : 600}
        style={{ pointerEvents: "none", userSelect: "none" }}>{ini(addr)}</text>
      <title>{addr.display_name ?? addr.address} ({addr.kind})</title>
    </g>
  );
}

// --- Matrix Heatmap ---
function MatrixHeatmap({ nodes, edges }: { nodes: AddressSummary[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<{ from: string; to: string; count: number } | null>(null);
  const mx = maxCount(edges);
  const cc = (n: number) => n === 0 ? "bg-zinc-800" : n / mx > 0.75 ? "bg-blue-500" : n / mx > 0.5 ? "bg-blue-600" : n / mx > 0.25 ? "bg-blue-700" : "bg-blue-900";

  if (!nodes.length) return <div className="text-zinc-500 text-sm py-8 text-center">No addresses found</div>;
  return (
    <div className="p-4 overflow-auto">
      {hover && <div className="mb-3 text-xs text-zinc-400">
        <span className="text-zinc-200">{hover.from}</span>{" \u2192 "}
        <span className="text-zinc-200">{hover.to}</span>{": "}
        <span className="text-blue-400 font-medium">{hover.count} message{hover.count !== 1 ? "s" : ""}</span>
      </div>}
      <div className="inline-grid gap-px" style={{ gridTemplateColumns: `120px repeat(${nodes.length}, 40px)` }}>
        <div />
        {nodes.map(c => <div key={`h-${c.address}`} className="text-[0.6rem] text-zinc-500 text-center truncate px-0.5" title={c.address}>{ini(c)}</div>)}
        {nodes.map(row => (<>
          <div key={`r-${row.address}`} className="text-xs text-zinc-400 truncate pr-2 flex items-center" title={row.address}>{lbl(row)}</div>
          {nodes.map(col => {
            const cnt = pairCount(edges, row.address, col.address);
            return <div key={`${row.address}-${col.address}`}
              className={`w-10 h-10 rounded-sm ${cc(cnt)} transition-colors cursor-default flex items-center justify-center text-[0.6rem] text-zinc-400`}
              onMouseEnter={() => setHover({ from: row.address, to: col.address, count: cnt })}
              onMouseLeave={() => setHover(null)}>{cnt > 0 ? cnt : ""}</div>;
          })}
        </>))}
      </div>
    </div>
  );
}

// --- Force-Directed Graph ---
interface FNode extends SimulationNodeDatum { id: string; addr: AddressSummary }
interface FLink extends SimulationLinkDatum<FNode> { count: number }

function ForceGraph({ nodes, edges }: { nodes: AddressSummary[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pos, setPos] = useState<FNode[]>([]);
  const [links, setLinks] = useState<FLink[]>([]);
  const dragRef = useRef<{ nodeId: string; sim: ReturnType<typeof forceSimulation<FNode>> } | null>(null);
  const [, bump] = useState(0);
  const mx = maxCount(edges);

  useEffect(() => {
    if (!nodes.length) return;
    const sn: FNode[] = nodes.map(a => ({ id: a.address, addr: a, x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 200 }));
    const nm = new Map(sn.map(n => [n.id, n]));
    const sl: FLink[] = edges.filter(e => nm.has(e.from) && nm.has(e.to)).map(e => ({ source: nm.get(e.from)!, target: nm.get(e.to)!, count: e.count }));
    const sim = forceSimulation<FNode>(sn)
      .force("link", forceLink<FNode, FLink>(sl).id(d => d.id).distance(120))
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(W / 2, H / 2))
      .on("tick", () => { setPos([...sn]); setLinks([...sl]); });
    dragRef.current = { nodeId: "", sim };
    return () => { sim.stop(); };
  }, [nodes, edges]);

  const onDown = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault(); if (!dragRef.current) return;
    dragRef.current.nodeId = id; dragRef.current.sim.alphaTarget(0.3).restart();
  }, []);
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current?.nodeId || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const node = pos.find(n => n.id === dragRef.current?.nodeId);
    if (node) { node.fx = e.clientX - r.left; node.fy = e.clientY - r.top; bump(c => c + 1); }
  }, [pos]);
  const onUp = useCallback(() => {
    if (!dragRef.current?.nodeId) return;
    const node = pos.find(n => n.id === dragRef.current?.nodeId);
    if (node) { node.fx = null; node.fy = null; }
    dragRef.current.nodeId = ""; dragRef.current.sim.alphaTarget(0);
  }, [pos]);

  return (
    <div className="p-4 overflow-auto">
      <svg ref={svgRef} width={W} height={H} className="bg-zinc-950 rounded border border-zinc-800"
        onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        {links.map((lk, i) => { const s = lk.source as FNode, t = lk.target as FNode;
          return <line key={i} x1={s.x ?? 0} y1={s.y ?? 0} x2={t.x ?? 0} y2={t.y ?? 0} stroke="#71717a" strokeWidth={1 + (lk.count / mx) * 4} strokeOpacity={0.6} />; })}
        {pos.map(n => <SvgNode key={n.id} x={n.x ?? 0} y={n.y ?? 0} addr={n.addr} onMouseDown={e => onDown(n.id, e)} />)}
      </svg>
      <div className="flex gap-4 mt-3 text-xs text-zinc-500">
        {Object.entries(KIND_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: c, backgroundColor: "#18181b" }} />{k}
        </span>)}
      </div>
    </div>
  );
}

// --- Ego View ---
function EgoView({ nodes, edges }: { nodes: AddressSummary[]; edges: GraphEdge[] }) {
  const [center, setCenter] = useState(nodes[0]?.address ?? "");
  const cx = W / 2, cy = H / 2, radius = Math.min(W, H) * 0.35;
  const conn = new Map<string, number>();
  for (const e of edges) {
    if (e.from === center) conn.set(e.to, (conn.get(e.to) ?? 0) + e.count);
    else if (e.to === center) conn.set(e.from, (conn.get(e.from) ?? 0) + e.count);
  }
  const nbrs = Array.from(conn.entries());
  const mx = Math.max(...nbrs.map(([, c]) => c), 1);
  const centerNode = nodes.find(n => n.address === center);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-zinc-500">Center:</label>
        <select value={center} onChange={e => setCenter(e.target.value)}
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs font-mono">
          {nodes.map(n => <option key={n.address} value={n.address}>{lbl(n)}</option>)}
        </select>
        <span className="text-xs text-zinc-600">{nbrs.length} connection{nbrs.length !== 1 ? "s" : ""}</span>
      </div>
      <svg width={W} height={H} className="bg-zinc-950 rounded border border-zinc-800">
        {nbrs.map(([addr, count], i) => {
          const a = (2 * Math.PI * i) / nbrs.length - Math.PI / 2;
          const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
          return <line key={`e-${addr}`} x1={cx} y1={cy} x2={x} y2={y} stroke="#71717a" strokeWidth={1 + (count / mx) * 4} strokeOpacity={0.6} />;
        })}
        {nbrs.map(([addr, count], i) => {
          const a = (2 * Math.PI * i) / nbrs.length - Math.PI / 2;
          const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
          const nd = nodes.find(n => n.address === addr);
          return <g key={`n-${addr}`}>
            {nd ? <SvgNode x={x} y={y} addr={nd} /> : <circle cx={x} cy={y} r={20} fill="#18181b" stroke="#71717a" strokeWidth={2.5} />}
            <text x={x} y={y} textAnchor="middle" dy="2.8em" fill="#a1a1aa" fontSize={9} style={{ pointerEvents: "none" }}>{count}</text>
          </g>;
        })}
        {centerNode && <SvgNode x={cx} y={cy} addr={centerNode} r={26} bold />}
      </svg>
    </div>
  );
}

// --- Main Screen ---
export function GraphScreen({ navigate: _navigate }: { address: string; navigate: (hash: string) => void }) {
  const [mode, setMode] = useState<Mode>("matrix");
  const { nodes, edges, isLoading, isError } = useGraphData();
  const modes: { key: Mode; label: string }[] = [
    { key: "matrix", label: "Matrix Heatmap" }, { key: "force", label: "Force-Directed" }, { key: "ego", label: "Ego View" },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        {modes.map(m => <button key={m.key} type="button" onClick={() => setMode(m.key)}
          className={`px-3 py-1 rounded text-sm transition-colors cursor-pointer ${mode === m.key ? "bg-zinc-700 text-zinc-100 font-medium" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{m.label}</button>)}
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">{nodes.length} node{nodes.length !== 1 ? "s" : ""}, {edges.length} edge{edges.length !== 1 ? "s" : ""}</span>
      </div>
      {isLoading && <div className="flex items-center justify-center py-12 text-zinc-500"><span className="animate-pulse">Loading graph data...</span></div>}
      {isError && <div className="flex flex-col items-center gap-3 py-12 text-zinc-400"><span>Failed to load graph data</span></div>}
      {!isLoading && !isError && <>
        {mode === "matrix" && <MatrixHeatmap nodes={nodes} edges={edges} />}
        {mode === "force" && <ForceGraph nodes={nodes} edges={edges} />}
        {mode === "ego" && nodes.length > 0 && <EgoView nodes={nodes} edges={edges} />}
        {mode === "ego" && nodes.length === 0 && <div className="text-zinc-500 text-sm py-8 text-center">No addresses available</div>}
      </>}
    </div>
  );
}
