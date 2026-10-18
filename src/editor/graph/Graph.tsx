import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Automaton } from "../../model/automaton.js";
import { trapLikeStates } from "../../validation/validate.js";
import { bounds, edgeKey, edgeShapes, R } from "./geometry.js";

export type CanvasTool = "select" | "state" | "edge";

export interface Highlight {
  current?: Set<string>;     // active states (orange, thick)
  activeEdges?: Set<string>; // edgeKey of transitions taken at this step
  pathStates?: Set<string>;  // accepting path (blue)
  pathEdges?: Set<string>;
  stuck?: string | null;
  errStates?: Set<string>;
  errEdges?: Set<string>;
  addedStates?: Set<string>; // just added by completion (marked until the next edit)
  addedEdges?: Set<string>;
}

interface Props {
  a: Automaton;
  editable: boolean;
  tool?: CanvasTool;
  highlight?: Highlight;
  selectedState?: string | null;
  selectedEdge?: string | null;
  scale?: number;
  /** presentation mode: grow circles and text until names and symbols render at least this many px (spec 8: 28px) */
  minScreenFont?: number;
  svgRef?: { current: SVGSVGElement | null };
  onMove?: (id: string, x: number, y: number, done: boolean) => void;
  onSelectState?: (id: string | null) => void;
  /** double-click on a state (used to toggle accepting) */
  onStateDblClick?: (id: string) => void;
  onSelectEdge?: (from: string, to: string, at: { x: number; y: number }) => void;
  onAddState?: (x: number, y: number) => void;
  onAddEdge?: (from: string, to: string, at: { x: number; y: number }) => void;
}

let seq = 0;

export function Graph(p: Props) {
  const [uid] = useState(() => `g${++seq}`);
  const local = useRef<SVGSVGElement | null>(null);
  const svg = p.svgRef ?? local;
  const [px, setPx] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!p.minScreenFont || !svg.current) return;
    const el = svg.current;
    const ro = new ResizeObserver(() => setPx({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.minScreenFont]);
  let scale = p.scale ?? 1;
  if (p.minScreenFont && px) {
    // the drawing's padding grows with the scale, so settle the scale in a few rounds
    for (let i = 0; i < 4; i++) {
      const b0 = bounds(p.a, 80 * Math.min(scale, 1.3));
      const ratio = Math.min(px.w / b0.w, px.h / b0.h);
      scale = Math.max(p.scale ?? 1, Math.min(3.2, p.minScreenFont / 17 / ratio));
    }
  }
  const gs = Math.min(scale, 1.6); // geometry grows less than text, so states do not collide
  const r = R * gs;
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [frozen, setFrozen] = useState<ReturnType<typeof bounds> | null>(null);
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const box = frozen ?? bounds(p.a, 80 * Math.min(scale, 1.3));
  const shapes = useMemo(() => edgeShapes(p.a, gs), [p.a, gs]);
  const traps = useMemo(() => new Set(trapLikeStates(p.a)), [p.a]);
  const accepting = new Set(p.a.acceptingStateIds);
  const h = p.highlight ?? {};
  const tool = p.tool ?? "select";

  const toSvg = (e: PointerEvent | MouseEvent) => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = el.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: q.x, y: q.y };
  };
  const toScreen = (x: number, y: number) => {
    const el = svg.current!;
    const m = el.getScreenCTM();
    const rect = el.getBoundingClientRect();
    if (!m) return { x: 0, y: 0 };
    const pt = el.createSVGPoint(); pt.x = x; pt.y = y;
    const s = pt.matrixTransform(m);
    return { x: s.x - rect.left, y: s.y - rect.top };
  };

  const downState = (e: PointerEvent, id: string) => {
    e.stopPropagation();
    if (!p.editable) return;
    if (tool === "edge") {
      if (edgeFrom === null) { setEdgeFrom(id); return; }
      const s = p.a.states.find(s => s.id === id)!;
      p.onAddEdge?.(edgeFrom, id, toScreen(s.x, s.y));
      setEdgeFrom(null);
      return;
    }
    const s = p.a.states.find(s => s.id === id)!;
    const q = toSvg(e);
    drag.current = { id, dx: q.x - s.x, dy: q.y - s.y, moved: false };
    setFrozen(box);
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
    p.onSelectState?.(id);
  };
  const move = (e: PointerEvent) => {
    if (tool === "edge" && edgeFrom) setHover(toSvg(e));
    const d = drag.current;
    if (!d) return;
    const q = toSvg(e);
    d.moved = true;
    p.onMove?.(d.id, Math.round(q.x - d.dx), Math.round(q.y - d.dy), false);
  };
  const up = (e: PointerEvent) => {
    const d = drag.current;
    if (d) {
      if (d.moved) { const q = toSvg(e); p.onMove?.(d.id, Math.round(q.x - d.dx), Math.round(q.y - d.dy), true); }
      drag.current = null;
      setFrozen(null);
    }
  };
  const downBg = (e: PointerEvent) => {
    if (!p.editable) return;
    if (tool === "state") { const q = toSvg(e); p.onAddState?.(Math.round(q.x), Math.round(q.y)); return; }
    setEdgeFrom(null);
    p.onSelectState?.(null);
  };
  const dbl = (e: MouseEvent) => {
    if (!p.editable || tool !== "select") return;
    const hit = (e.target as Element).closest(".g-state, .g-edge");
    if (hit) {
      const id = hit.getAttribute("data-id");
      if (id && hit.classList.contains("g-state")) p.onStateDblClick?.(id);
      return;
    }
    const q = toSvg(e);
    p.onAddState?.(Math.round(q.x), Math.round(q.y));
  };

  const start = p.a.states.find(s => s.id === p.a.initialStateId);
  const fromState = edgeFrom ? p.a.states.find(s => s.id === edgeFrom) : null;

  return (
    <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={move} onPointerUp={up} onPointerDown={downBg} onDblClick={dbl}
      role="img" aria-label="ציור האוטומט" style={{ cursor: tool === "state" ? "crosshair" : "default" }}>
      <defs>
        {(["k", "o", "b", "r"] as const).map(c => (
          <marker key={c} id={`${uid}-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={c === "o" ? 5 : 7} markerHeight={c === "o" ? 5 : 7} orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={c === "k" ? "#172033" : c === "o" ? "#E8740C" : c === "b" ? "#2C5BD4" : "#B93A2B"} />
          </marker>
        ))}
      </defs>
      {start && <path class="g-start" d={`M${start.x - r - 44 * gs} ${start.y}H${start.x - r - 3}`} marker-end={`url(#${uid}-k)`} />}
      {shapes.map(s => {
        const active = h.activeEdges?.has(s.key);
        const onpath = !active && h.pathEdges?.has(s.key);
        const err = h.errEdges?.has(s.key);
        const sel = p.selectedEdge === s.key;
        const cls = `g-edge${active ? " active" : ""}${onpath ? " onpath" : ""}${err ? " err" : ""}${sel ? " sel" : ""}${h.addedEdges?.has(s.key) ? " added" : ""}`;
        const marker = active ? "o" : onpath || sel ? "b" : err ? "r" : "k";
        const click = (e: PointerEvent) => {
          e.stopPropagation();
          if (p.editable && tool !== "state") p.onSelectEdge?.(s.from, s.to, toScreen(s.lx, s.ly));
        };
        return (
          <g class={cls} key={s.key}>
            <path d={s.d} marker-end={`url(#${uid}-${marker})`} />
            <path class="hit" d={s.d} onPointerDown={click} />
            <text x={s.lx} y={s.ly} text-anchor="middle" direction="ltr" onPointerDown={click} font-size={`${16 * scale}px`} style={{ cursor: p.editable ? "pointer" : "default", fontSize: `${(p.minScreenFont ? 17 : 16) * scale}px` }}>{s.symbols.join(",")}</text>
          </g>
        );
      })}
      {fromState && hover && <path class="pending-edge" d={`M${fromState.x} ${fromState.y}L${hover.x} ${hover.y}`} />}
      {p.a.states.map(s => {
        const cur = h.current?.has(s.id);
        const stuck = h.stuck === s.id;
        const onpath = !cur && h.pathStates?.has(s.id);
        const cls = ["g-state", traps.has(s.id) && "trap", stuck ? "stuck" : cur ? "cur" : onpath ? "onpath" : "",
          h.errStates?.has(s.id) && !cur && "err", h.addedStates?.has(s.id) && "added", (p.selectedState === s.id || edgeFrom === s.id) && "sel"].filter(Boolean).join(" ");
        const fs = Math.min(17 * scale, (2 * r - 8) / Math.max(2, [...s.label].length) * 1.75);
        return (
          <g class={cls} key={s.id} data-id={s.id} onPointerDown={e => downState(e as PointerEvent, s.id)}
            onContextMenu={e => { if (p.editable) { e.preventDefault(); p.onSelectState?.(s.id); } }} style={{ cursor: p.editable ? (tool === "edge" ? "pointer" : "grab") : "default" }}>
            <circle class="body" cx={s.x} cy={s.y} r={r} />
            {accepting.has(s.id) && <circle class="ring" cx={s.x} cy={s.y} r={r - 5 * gs} />}
            <text x={s.x} y={s.y + fs * 0.36} text-anchor="middle" style={{ fontSize: `${fs}px` }}>{s.label}</text>
            {h.errStates?.has(s.id) && (
              <g class="badge"><circle cx={s.x + r * 0.75} cy={s.y - r * 0.75} r={10} /><text x={s.x + r * 0.75} y={s.y - r * 0.75 + 4.5} text-anchor="middle">!</text></g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export { edgeKey };
