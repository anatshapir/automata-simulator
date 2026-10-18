import { useMemo } from "preact/hooks";
import { type Automaton, Index } from "../model/automaton.js";
import { hiddenMessage, type LeafKind, tree } from "../engine/run.js";
import type { Runner } from "./runner.js";

interface Node { key: string; depth: number; state: string; y: number; parent: string | null; kind: LeafKind | null; leafIndexes: number[] }

/**
 * Computation tree (spec 5.4), left to right. While stepping, the prefixes (depth <= step) of the leaves
 * that will be shown at the end are drawn; the run is precomputed so this is exact.
 */
export function TreeView({ a, rn }: { a: Automaton; rn: Runner }) {
  const t = useMemo(() => tree(a, rn.word), [a, rn.word]);
  const ix = new Index(a);
  const n = rn.word.length;
  const colW = 92, rowH = 52, top = 34, left = 34;

  const nodes = useMemo(() => {
    const map = new Map<string, Node>();
    t.shown.forEach((leaf, li) => {
      let parent: string | null = null;
      leaf.path.forEach((state, d) => {
        const key = leaf.path.slice(0, d + 1).join(">");
        const node = map.get(key) ?? { key, depth: d, state, y: 0, parent, kind: null, leafIndexes: [] };
        node.leafIndexes.push(li);
        if (d === leaf.path.length - 1) node.kind = leaf.kind;
        map.set(key, node);
        parent = key;
      });
    });
    for (const node of map.values()) node.y = top + 22 + (node.leafIndexes.reduce((s, i) => s + i, 0) / node.leafIndexes.length) * rowH;
    return [...map.values()];
  }, [t]);

  const byKey = new Map(nodes.map(x => [x.key, x]));
  const accKeys = new Set(t.shown.filter(l => l.kind === "accepting").flatMap(l => l.path.map((_, d) => l.path.slice(0, d + 1).join(">"))));
  const width = left * 2 + colW * n + 120;
  const height = top + 30 + Math.max(1, t.shown.length) * rowH;
  const x = (d: number) => left + d * colW;
  const visible = nodes.filter(nd => nd.depth <= rn.step);
  const msg = hiddenMessage(t);

  return (
    <div class="stack">
      <div class="row small" style={{ gap: "14px" }}>
        <strong>{t.totalLeaves} עלים</strong>
        <span style={{ color: "#1E44A8" }}>{t.leaves.accepting} מקבלים</span>
        <span class="muted">{t.leaves.rejecting} דוחים</span>
        <span style={{ color: "#8A2A1F" }}>{t.leaves.stuck} נתקעו</span>
        <span class="muted">{t.displayRule === "full" ? "· מוצג במלואו (עד 16 עלים)" : "· מעל 16 עלים: מוצגים רק ענפים מקבלים"}</span>
      </div>
      {msg && <div class="tool-out">{msg}</div>}
      {t.shown.length > 0 && (
        <div class="tree-wrap">
          <div style={{ position: "relative", width: `${width}px`, height: `${height}px` }}>
          <svg width={width} height={height} role="img" aria-label="עץ החישוב">
            {rn.word.map((c, i) => <text key={i} x={x(i) + colW / 2} y={20} text-anchor="middle" class="mono" style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "15px", fill: i < rn.step ? "#5A6577" : i === rn.step ? "#9A4F05" : "#A3ACB9", fontWeight: 600 }}>{c}</text>)}
            {visible.filter(nd => nd.parent).map(nd => {
              const p = byKey.get(nd.parent!)!;
              return <path key={`e${nd.key}`} class={`tree-edge${rn.done && accKeys.has(nd.key) ? " acc" : ""}`} d={`M${x(p.depth) + 18} ${p.y}L${x(nd.depth) - 18} ${nd.y}`} />;
            })}
            {visible.map(nd => {
              const atEnd = rn.done && nd.kind !== null;
              const cls = atEnd ? (nd.kind === "accepting" ? "acc" : nd.kind === "rejecting" ? "rej" : "stk") : nd.depth === rn.step && !rn.done ? "cur" : rn.done && accKeys.has(nd.key) ? "acc" : "";
              const tag = atEnd ? (nd.kind === "accepting" ? "מקבל ✓" : nd.kind === "rejecting" ? "דוחה" : `✕ נתקע על ${rn.word[nd.depth]}`) : null;
              const stuckEarly = !rn.done && nd.kind === "stuck" && nd.depth < rn.step;
              return (
                <g key={nd.key} class={`tree-node ${stuckEarly ? "stk" : cls}`}>
                  <circle cx={x(nd.depth)} cy={nd.y} r={18} />
                  <text x={x(nd.depth)} y={nd.y + 5} text-anchor="middle">{ix.label(nd.state)}</text>
                </g>
              );
            })}
          </svg>
          {visible.map(nd => {
            const atEnd = rn.done && nd.kind !== null;
            const stuckEarly = !rn.done && nd.kind === "stuck" && nd.depth < rn.step;
            if (!atEnd && !stuckEarly) return null;
            const text = nd.kind === "accepting" ? "מקבל ✓" : nd.kind === "rejecting" ? "דוחה" : `✕ נתקע על ${rn.word[nd.depth]}`;
            const color = nd.kind === "accepting" ? "#1E44A8" : nd.kind === "stuck" ? "#8A2A1F" : "#5A6577";
            return <div key={`t${nd.key}`} dir="rtl" class="tree-tag" style={{ position: "absolute", left: `${x(nd.depth) + 24}px`, top: `${nd.y - 11}px`, color, fontWeight: nd.kind === "accepting" ? 700 : 500, whiteSpace: "nowrap", lineHeight: "22px" }}>{text}</div>;
          })}
          </div>
        </div>
      )}
      {t.shown.length === 0 && <div class="small muted">אין ענף מקבל להצגה.</div>}
      <div class="small muted">בעץ כל ענף מופיע לחוד, גם כשענפים מגיעים לאותו מצב. בקבוצת המצבים כל מצב מופיע פעם אחת. ההכרעה לא תלויה בצמצום העץ.</div>
    </div>
  );
}
