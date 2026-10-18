import type { Automaton } from "../../model/automaton.js";

export const R = 28;

export interface EdgeShape {
  key: string;            // "from>to"
  from: string;
  to: string;
  symbols: string[];      // in alphabet order; unknown symbols last
  d: string;              // svg path
  lx: number; ly: number; // label position
  loop: boolean;
}

export const edgeKey = (from: string, to: string) => `${from}>${to}`;

/** One drawn arrow per (from, to); "a,b" on the arrow = several transitions in the model (spec 2.3). */
export function edgeShapes(a: Automaton, scale = 1): EdgeShape[] {
  const pos = new Map(a.states.map(s => [s.id, s]));
  const groups = new Map<string, { from: string; to: string; symbols: string[] }>();
  for (const t of a.transitions) {
    if (!pos.has(t.from) || !pos.has(t.to)) continue;
    const k = edgeKey(t.from, t.to);
    const g = groups.get(k) ?? { from: t.from, to: t.to, symbols: [] };
    if (!g.symbols.includes(t.symbol)) g.symbols.push(t.symbol);
    groups.set(k, g);
  }
  const order = (c: string) => { const i = a.alphabet.indexOf(c); return i < 0 ? 1e6 : i; };
  const r = R * scale;
  const out: EdgeShape[] = [];
  for (const [key, g] of groups) {
    g.symbols.sort((x, y) => order(x) - order(y));
    const p = pos.get(g.from)!, q = pos.get(g.to)!;
    if (g.from === g.to) {
      const h = 52 * scale, w = 30 * scale, dx = 12 * scale;
      out.push({ key, ...g, loop: true,
        d: `M${p.x - dx} ${p.y - r + 3}C${p.x - w} ${p.y - r - h} ${p.x + w} ${p.y - r - h} ${p.x + dx} ${p.y - r + 3}`,
        lx: p.x, ly: p.y - r - h + 6 * scale });
      continue;
    }
    const both = groups.has(edgeKey(g.to, g.from));
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // normal (to the left of the direction)
    const bend = both ? 26 * scale : 0;
    const mx = (p.x + q.x) / 2 + nx * bend * 2, my = (p.y + q.y) / 2 + ny * bend * 2; // quadratic control
    // boundary points towards the control point
    const sx0 = mx - p.x, sy0 = my - p.y, sl = Math.hypot(sx0, sy0) || 1;
    const ex0 = mx - q.x, ey0 = my - q.y, el = Math.hypot(ex0, ey0) || 1;
    const sx = p.x + (sx0 / sl) * r, sy = p.y + (sy0 / sl) * r;
    const ex = q.x + (ex0 / el) * (r + 2), ey = q.y + (ey0 / el) * (r + 2);
    // label: curve midpoint, nudged off the line
    const cx = 0.25 * sx + 0.5 * mx + 0.25 * ex, cy = 0.25 * sy + 0.5 * my + 0.25 * ey;
    const off = (both ? 14 : 13) * scale;
    out.push({ key, ...g, loop: false, d: `M${sx} ${sy}Q${mx} ${my} ${ex} ${ey}`, lx: cx + nx * off, ly: cy + ny * off + 5 * scale });
  }
  return out;
}

export function bounds(a: Automaton, pad = 80) {
  if (a.states.length === 0) return { x: 0, y: 0, w: 640, h: 360 };
  const xs = a.states.map(s => s.x), ys = a.states.map(s => s.y);
  const minX = Math.min(...xs) - pad - 30, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad - 30, maxY = Math.max(...ys) + pad - 20;
  let w = maxX - minX, h = maxY - minY;
  const x = minX - Math.max(0, 640 - w) / 2, y = minY - Math.max(0, 300 - h) / 2;
  w = Math.max(w, 640); h = Math.max(h, 300);
  return { x, y, w, h };
}
