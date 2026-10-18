import { type Automaton, Index, nextId, nextLabel, type TestWord, type Word } from "../model/automaton.js";
import { run, type Run } from "../engine/run.js";
import { showWord } from "../engine/word.js";
import { reachableStates, trapLikeStates } from "../validation/validate.js";

/** Tools T-1..T-9 (spec 7.1). All take a runnable automaton (no validation errors). */

type SetKey = string;

class Subsets {
  readonly ix: Index;
  constructor(readonly a: Automaton) { this.ix = new Index(a); }
  start(): string[] { return [this.a.initialStateId!]; }
  step(S: string[], c: string): string[] {
    const n = new Set<string>();
    for (const q of S) for (const t of this.ix.targets(q, c)) n.add(t);
    return this.ix.order(n);
  }
  accepts(S: string[]) { return S.some(q => this.ix.accepting.has(q)); }
  key(S: string[]): SetKey { return S.join("|"); }
  /** every reachable subset with its distance to acceptance (Infinity = cannot accept) */
  distances(): Map<SetKey, number> {
    const all = new Map<SetKey, string[]>();
    const queue = [this.start()];
    all.set(this.key(queue[0]!), queue[0]!);
    while (queue.length) {
      const S = queue.shift()!;
      for (const c of this.a.alphabet) {
        const T = this.step(S, c);
        const k = this.key(T);
        if (!all.has(k)) { all.set(k, T); queue.push(T); }
      }
    }
    const dist = new Map<SetKey, number>();
    for (const [k, S] of all) dist.set(k, this.accepts(S) ? 0 : Infinity);
    for (let changed = true; changed;) {
      changed = false;
      for (const [k, S] of all) for (const c of this.a.alphabet) {
        const d = dist.get(this.key(this.step(S, c)))! + 1;
        if (d < dist.get(k)!) { dist.set(k, d); changed = true; }
      }
    }
    return dist;
  }
}

/** T-1 */
export const acceptsEpsilon = (a: Automaton) => a.acceptingStateIds.includes(a.initialStateId!);

/** T-2: all accepted words of minimal length, in alphabet order ([] if the language is empty). */
export function shortestAccepted(a: Automaton): Word[] {
  const s = new Subsets(a);
  const dist = s.distances();
  const k = dist.get(s.key(s.start()))!;
  if (k === Infinity) return [];
  const out: Word[] = [];
  const dfs = (S: string[], rem: number, prefix: Word) => {
    if (rem === 0) { if (s.accepts(S)) out.push(prefix); return; }
    for (const c of a.alphabet) {
      const T = s.step(S, c);
      if (dist.get(s.key(T))! <= rem - 1) dfs(T, rem - 1, [...prefix, c]);
    }
  };
  dfs(s.start(), k, []);
  return out;
}

/** T-3: run a list of words and compare with the expected answer. */
export interface CheckedWord { word: Word; run: Run; expected: boolean | null; correct: boolean | null; message: string | null }

export function checkWords(a: Automaton, words: Array<TestWord | { word: Word; expected?: boolean }>): CheckedWord[] {
  return words.map(tw => {
    const r = run(a, tw.word);
    const expected = tw.expected ?? null;
    if (expected === null) return { word: tw.word, run: r, expected, correct: null, message: null };
    const correct = r.accepted === expected;
    const w = showWord(tw.word, a.alphabet);
    const message = correct ? null : r.accepted
      ? `האוטומט שלך מקבל את ${w}, אבל היא לא בשפה.`
      : `האוטומט שלך דוחה את ${w}, אבל היא בשפה.`;
    return { word: tw.word, run: r, expected, correct, message };
  });
}

/** T-4: accepted words up to length n, by length and then in alphabet order, at most `cap`. */
export const ENUM_CAP = 200;

export function acceptedUpTo(a: Automaton, n: number, cap = ENUM_CAP): { words: Word[]; truncated: boolean } {
  const s = new Subsets(a);
  const dist = s.distances();
  const words: Word[] = [];
  let layer: Array<{ w: Word; S: string[] }> = [{ w: [], S: s.start() }];
  for (let len = 0; len <= n; len++) {
    for (const { w, S } of layer) {
      if (s.accepts(S)) {
        if (words.length === cap) return { words, truncated: true };
        words.push(w);
      }
    }
    if (len === n) break;
    const next: typeof layer = [];
    for (const { w, S } of layer) for (const c of a.alphabet) {
      const T = s.step(S, c);
      // keep only prefixes that can still reach acceptance within the length budget
      if (dist.get(s.key(T))! <= n - len - 1) next.push({ w: [...w, c], S: T });
    }
    layer = next;
  }
  return { words, truncated: false };
}

/** T-5 */
export function unreachableStates(a: Automaton): string[] {
  const r = reachableStates(a);
  return a.states.filter(s => !r.has(s.id)).map(s => s.id);
}

/** T-6: states with no path to an accepting state. Every trap is dead, not the other way round. */
export function deadStates(a: Automaton): string[] {
  const live = new Set(a.acceptingStateIds);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of a.transitions) if (!live.has(t.from) && live.has(t.to)) { live.add(t.from); changed = true; }
  }
  return a.states.filter(s => !live.has(s.id)).map(s => s.id);
}

/** Trap marking (grey fill) by the course definition: derived, never set by hand. */
export const trapStates = trapLikeStates;

/** T-7: completion of a partial DFA, as a copy. The original is not changed. */
export interface Completion { automaton: Automaton; trapId: string; trapLabel: string; added: Array<[string, string, string]> }

export function completeToFull(a: Automaton): Completion {
  const ix = new Index(a);
  const trapId = nextId("s", a.states.map(s => s.id));
  const trapLabel = nextLabel(a);
  const used = a.transitions.map(t => t.id);
  const transitions = [...a.transitions];
  const added: Array<[string, string, string]> = [];
  const add = (from: string, symbol: string) => {
    const id = nextId("t", used);
    used.push(id);
    transitions.push({ id, from, symbol, to: trapId });
  };
  for (const s of a.states) for (const c of a.alphabet) {
    if (ix.targets(s.id, c).length === 0) { add(s.id, c); added.push([s.label, c, trapLabel]); }
  }
  for (const c of a.alphabet) add(trapId, c);
  const maxX = Math.max(...a.states.map(s => s.x));
  const maxY = Math.max(...a.states.map(s => s.y));
  const automaton: Automaton = {
    ...structuredClone(a),
    type: "dfa-full",
    ...(a.title ? { title: `${a.title} (הושלם לאסד״מ)` } : {}),
    states: [...structuredClone(a.states), { id: trapId, label: trapLabel, x: maxX, y: maxY + 140, memory: "מלכודת: המילה כבר לא יכולה להתקבל" }],
    transitions,
  };
  return { automaton, trapId, trapLabel, added };
}

/** T-8 */
export function counts(a: Automaton) {
  return {
    states: a.states.length,
    transitions: a.transitions.length,
    selfLoops: a.transitions.filter(t => t.from === t.to).length,
  };
}

/** T-9: build-steps checklist (spec 7.1). `tried` comes from the words the student ran. */
export interface ChecklistItem { id: "epsilon" | "short" | "cells" | "memory" | "inside" | "outside"; label: string; done: boolean; detail?: string }

export function buildChecklist(a: Automaton, tried: { accepted: boolean }[], runnable: boolean): ChecklistItem[] {
  const ix = new Index(a);
  const items: ChecklistItem[] = [];
  items.push({ id: "epsilon", label: "האם ε בשפה? (קובע אם המצב ההתחלתי מקבל)", done: runnable,
    ...(runnable ? { detail: acceptsEpsilon(a) ? "ε מתקבלת" : "ε נדחית" } : {}) });
  const short = runnable ? shortestAccepted(a) : [];
  items.push({ id: "short", label: "מילה קצרה ביותר בשפה", done: runnable && short.length > 0,
    ...(runnable ? { detail: short.length ? short.map(w => showWord(w, a.alphabet)).join(", ") : "השפה ריקה" } : {}) });
  if (a.type === "dfa-full") {
    const missing = a.states.reduce((n, s) => n + a.alphabet.filter(c => ix.targets(s.id, c).length === 0).length, 0);
    items.push({ id: "cells", label: "מכל מצב יוצא מעבר לכל סמל", done: missing === 0, ...(missing ? { detail: `חסרים ${missing}` } : {}) });
  }
  const noMemory = a.states.filter(s => !s.memory?.trim()).length;
  items.push({ id: "memory", label: "לכל מצב כתוב מה הוא זוכר", done: noMemory === 0, ...(noMemory ? { detail: `חסר ב-${noMemory}` } : {}) });
  items.push({ id: "inside", label: "הרצתי מילה שבשפה", done: tried.some(t => t.accepted) });
  items.push({ id: "outside", label: "הרצתי מילה שלא בשפה", done: tried.some(t => !t.accepted) });
  return items;
}
