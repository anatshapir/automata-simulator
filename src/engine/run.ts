import { type Automaton, Index, type Word } from "../model/automaton.js";
import { ordinal } from "./word.js";

export interface Edge { from: string; symbol: string; to: string }

/** Configuration after `index` symbols were read (index 0 = before reading). */
export interface Step {
  index: number;
  /** active states, in state order: one for a deterministic run, a set for an NFA */
  active: string[];
  /** transitions taken to reach this step (empty for step 0) */
  edges: Edge[];
}

export type RunStatus = "accepted" | "rejected" | "stuck" | "emptied";

export interface Explanation {
  /** catalog code (F-12..F-16) or "ok" for an accepted word without a catalog message */
  code: "F-12" | "F-13" | "F-14" | "F-15" | "F-16" | "ok";
  message: string;
}

export interface Run {
  word: Word;
  steps: Step[];
  status: RunStatus;
  accepted: boolean;
  /** deterministic run: state ids, from the start up to the last state reached */
  path: string[] | null;
  /** dfa-partial: where the run got stuck */
  stuck: { atIndex: number; stateId: string; symbol: string } | null;
  /** NFA: index of the symbol that emptied the set */
  emptyAtIndex: number | null;
  /** symbols never consumed (the stuck symbol included) */
  unread: Word;
  /** NFA, accepted word: one accepting path, earliest state in state order at every choice */
  oneAcceptingPath: string[] | null;
  explanation: Explanation;
}

/** Precondition: the automaton has no errors (validate) and the word is over Σ (wordIssue). */
export function run(a: Automaton, word: Word): Run {
  const ix = new Index(a);
  const start = a.initialStateId!;
  return a.type === "nfa" ? runNfa(a, ix, start, word) : runDet(a, ix, start, word);
}

function runDet(a: Automaton, ix: Index, start: string, w: Word): Run {
  let q = start;
  const steps: Step[] = [{ index: 0, active: [q], edges: [] }];
  const path = [q];
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    const next = ix.targets(q, c)[0];
    if (next === undefined) {
      return {
        word: w, steps, status: "stuck", accepted: false, path, stuck: { atIndex: i, stateId: q, symbol: c },
        emptyAtIndex: null, unread: w.slice(i), oneAcceptingPath: null,
        explanation: { code: "F-14", message: `מ-${ix.label(q)} אין מעבר מתאים עבור ${c}, ונותרו סימנים לקריאה. המילה נדחית.` },
      };
    }
    steps.push({ index: i + 1, active: [next], edges: [{ from: q, symbol: c, to: next }] });
    path.push(next);
    q = next;
  }
  const accepted = ix.accepting.has(q);
  let explanation: Explanation;
  if (accepted) {
    explanation = { code: "ok", message: w.length === 0
      ? `ε מתקבלת, כי המצב ההתחלתי ${ix.label(q)} מקבל.`
      : `קריאת המילה הסתיימה ב-${ix.label(q)}, שהוא מקבל, לכן המילה בשפה.` };
  } else {
    const passed = path.slice(0, -1).find(id => ix.accepting.has(id));
    explanation = passed !== undefined && w.length > 0
      ? { code: "F-13", message: `עברת ב-${ix.label(passed)} באמצע, אבל בודקים רק אחרי הסמל האחרון. הקריאה הסתיימה ב-${ix.label(q)}, שאינו מקבל.` }
      : { code: "F-12", message: `קריאת המילה הסתיימה ב-${ix.label(q)}, שאינו מקבל, לכן המילה לא בשפה.` };
  }
  return { word: w, steps, status: accepted ? "accepted" : "rejected", accepted, path, stuck: null,
    emptyAtIndex: null, unread: [], oneAcceptingPath: null, explanation };
}

function runNfa(a: Automaton, ix: Index, start: string, w: Word): Run {
  let active = [start];
  const steps: Step[] = [{ index: 0, active, edges: [] }];
  const setText = (ids: string[]) => `{${ids.map(id => ix.label(id)).join(",")}}`;
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    const edges: Edge[] = [];
    const next = new Set<string>();
    for (const q of active) for (const t of ix.targets(q, c)) { edges.push({ from: q, symbol: c, to: t }); next.add(t); }
    active = ix.order(next);
    steps.push({ index: i + 1, active, edges });
    if (active.length === 0) {
      const left = w.length - i - 1;
      return {
        word: w, steps, status: "emptied", accepted: false, path: null, stuck: null, emptyAtIndex: i,
        unread: w.slice(i + 1), oneAcceptingPath: null,
        explanation: { code: "F-16", message: left > 0
          ? `אף מסלול לא המשיך אחרי הסמל ${ordinal(i)}, ונותרו סימנים לקריאה. מסלול שנתקע אינו מקבל.`
          : `אף מסלול לא הצליח לקרוא את הסמל האחרון. מסלול שנתקע אינו מקבל.` },
      };
    }
  }
  const accepted = active.some(id => ix.accepting.has(id));
  let explanation: Explanation;
  if (accepted) {
    const t = treeCounts(a, ix, start, w);
    explanation = t.rejecting + t.stuck > 0
      ? { code: "F-15", message: "קיימת לפחות ריצה מקבלת אחת. לא צריך שכל המסלולים יקבלו." }
      : { code: "ok", message: w.length === 0 ? `ε מתקבלת, כי המצב ההתחלתי ${ix.label(start)} מקבל.` : "קיימת לפחות ריצה מקבלת אחת." };
  } else {
    explanation = { code: "F-12", message: `קריאת המילה הסתיימה בקבוצה ${setText(active)}, ואין בה מצב מקבל, לכן המילה לא בשפה.` };
  }
  return { word: w, steps, status: accepted ? "accepted" : "rejected", accepted, path: null, stuck: null,
    emptyAtIndex: null, unread: [], oneAcceptingPath: accepted ? oneAcceptingPath(a, ix, start, w) : null, explanation };
}

/** Backtrack from the earliest accepting state through the layers (spec 10.3). */
function oneAcceptingPath(a: Automaton, ix: Index, start: string, w: Word): string[] {
  const layers: Set<string>[] = [new Set([start])];
  for (const c of w) {
    const n = new Set<string>();
    for (const q of layers.at(-1)!) for (const t of ix.targets(q, c)) n.add(t);
    layers.push(n);
  }
  const end = ix.order(layers.at(-1)!).find(id => ix.accepting.has(id))!;
  const path = [end];
  for (let i = w.length - 1; i >= 0; i--) {
    const prev = ix.order(layers[i]!).find(p => ix.targets(p, w[i]!).includes(path[0]!))!;
    path.unshift(prev);
  }
  return path;
}

// ------------------------------------------------------------------ computation tree (spec 5.4)

export const TREE_LIMIT = 16;

export type LeafKind = "accepting" | "rejecting" | "stuck";

export interface Leaf {
  /** state ids from the root; a stuck leaf ends at the state that had no transition */
  path: string[];
  kind: LeafKind;
}

export interface Tree {
  totalLeaves: number;
  leaves: Record<LeafKind, number>;
  displayRule: "full" | "acceptingOnly";
  /** leaves to draw: every leaf ("full"), or accepting leaves only, at most 16 ("acceptingOnly") */
  shown: Leaf[];
  hidden: { total: number } & Record<LeafKind, number>;
}

function treeCounts(a: Automaton, ix: Index, start: string, w: Word): Record<LeafKind, number> {
  let layer = new Map<string, number>([[start, 1]]);
  let stuck = 0;
  for (const c of w) {
    const next = new Map<string, number>();
    for (const [q, m] of layer) {
      const ts = ix.targets(q, c);
      if (ts.length === 0) stuck += m;
      for (const t of ts) next.set(t, (next.get(t) ?? 0) + m);
    }
    layer = next;
  }
  let accepting = 0, rejecting = 0;
  for (const [q, m] of layer) ix.accepting.has(q) ? (accepting += m) : (rejecting += m);
  return { accepting, rejecting, stuck };
}

/** Leaves in depth-first order, targets in state order; stops after `cap` leaves of the wanted kinds. */
function enumerate(ix: Index, start: string, w: Word, cap: number, onlyAccepting: boolean): Leaf[] {
  const out: Leaf[] = [];
  const go = (q: string, i: number, path: string[]) => {
    if (out.length >= cap) return;
    if (i === w.length) {
      const kind: LeafKind = ix.accepting.has(q) ? "accepting" : "rejecting";
      if (!onlyAccepting || kind === "accepting") out.push({ path, kind });
      return;
    }
    const ts = ix.order(ix.targets(q, w[i]!));
    if (ts.length === 0) {
      if (!onlyAccepting) out.push({ path, kind: "stuck" });
      return;
    }
    for (const t of ts) go(t, i + 1, [...path, t]);
  };
  go(start, 0, [start]);
  return out;
}

export function tree(a: Automaton, word: Word, limit = TREE_LIMIT): Tree {
  const ix = new Index(a);
  const start = a.initialStateId!;
  const leaves = treeCounts(a, ix, start, word);
  const totalLeaves = leaves.accepting + leaves.rejecting + leaves.stuck;
  if (totalLeaves <= limit) {
    return { totalLeaves, leaves, displayRule: "full", shown: enumerate(ix, start, word, limit, false),
      hidden: { total: 0, accepting: 0, rejecting: 0, stuck: 0 } };
  }
  const shown = enumerate(ix, start, word, limit, true);
  return { totalLeaves, leaves, displayRule: "acceptingOnly", shown,
    hidden: { total: totalLeaves - shown.length, accepting: leaves.accepting - shown.length, rejecting: leaves.rejecting, stuck: leaves.stuck } };
}

/** "הוסתרו N ענפים: X מקבלים, Y דוחים, Z נתקעו" (spec 5.4) */
export function hiddenMessage(t: Tree): string | null {
  if (t.hidden.total === 0) return null;
  const h = t.hidden;
  return `הוסתרו ${h.total} ענפים: ${h.accepting} מקבלים, ${h.rejecting} דוחים, ${h.stuck} נתקעו`;
}
