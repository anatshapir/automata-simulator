import { type Automaton, type AutomatonType, nextId, nextLabel, normalize } from "../model/automaton.js";

/** Pure edit operations. Every op returns a new automaton; nothing is deleted silently (spec 4.2). */

export function addState(a: Automaton, x: number, y: number): { a: Automaton; id: string } {
  const id = nextId("s", a.states.map(s => s.id));
  const state = { id, label: nextLabel(a), x, y, memory: "" };
  const initialStateId = a.initialStateId ?? id;
  return { a: { ...a, states: [...a.states, state], initialStateId }, id };
}

export const moveState = (a: Automaton, id: string, x: number, y: number): Automaton =>
  ({ ...a, states: a.states.map(s => s.id === id ? { ...s, x, y } : s) });

export const patchState = (a: Automaton, id: string, patch: { label?: string; memory?: string }): Automaton =>
  ({ ...a, states: a.states.map(s => s.id === id ? { ...s, ...patch } : s) });

export const setInitial = (a: Automaton, id: string): Automaton => ({ ...a, initialStateId: id });

export const toggleAccepting = (a: Automaton, id: string): Automaton => ({
  ...a,
  acceptingStateIds: a.acceptingStateIds.includes(id)
    ? a.acceptingStateIds.filter(x => x !== id)
    : a.states.map(s => s.id).filter(x => x === id || a.acceptingStateIds.includes(x)),
});

/** Deletes the state and its incoming and outgoing transitions (undoable by the caller). */
export function deleteState(a: Automaton, id: string): Automaton {
  return {
    ...a,
    states: a.states.filter(s => s.id !== id),
    transitions: a.transitions.filter(t => t.from !== id && t.to !== id),
    acceptingStateIds: a.acceptingStateIds.filter(x => x !== id),
    initialStateId: a.initialStateId === id ? null : a.initialStateId,
  };
}

function withTransitions(a: Automaton, keep: (t: Automaton["transitions"][number]) => boolean, add: Array<{ from: string; symbol: string; to: string }>): Automaton {
  const transitions = a.transitions.filter(keep);
  const used = a.transitions.map(t => t.id);
  for (const n of add) {
    if (transitions.some(t => t.from === n.from && t.symbol === n.symbol && t.to === n.to)) continue;
    const id = nextId("t", used);
    used.push(id);
    transitions.push({ id, ...n });
  }
  return normalize({ ...a, transitions });
}

/** The symbols drawn on the arrow from -> to. */
export function setEdgeSymbols(a: Automaton, from: string, to: string, symbols: string[]): Automaton {
  return withTransitions(a, t => !(t.from === from && t.to === to) || symbols.includes(t.symbol),
    symbols.map(symbol => ({ from, symbol, to })));
}

/** A table cell δ(from, symbol). */
export function setCell(a: Automaton, from: string, symbol: string, targets: string[]): Automaton {
  return withTransitions(a, t => !(t.from === from && t.symbol === symbol) || targets.includes(t.to),
    targets.map(to => ({ from, symbol, to })));
}

/** Transitions on a removed symbol stay and are marked (F-05). */
export const setAlphabet = (a: Automaton, alphabet: string[]): Automaton => ({ ...a, alphabet });

/** Changing the type never deletes data; the new violations are shown (spec 4.1). */
export const setType = (a: Automaton, type: AutomatonType): Automaton => ({ ...a, type });

/** Initial arrangement left to right by distance from the start state. */
export function autoLayout(a: Automaton): Automaton {
  const level = new Map<string, number>();
  if (a.initialStateId) {
    level.set(a.initialStateId, 0);
    const queue = [a.initialStateId];
    while (queue.length) {
      const q = queue.shift()!;
      for (const t of a.transitions) if (t.from === q && !level.has(t.to)) { level.set(t.to, level.get(q)! + 1); queue.push(t.to); }
    }
  }
  let maxL = Math.max(0, ...level.values());
  for (const s of a.states) if (!level.has(s.id)) level.set(s.id, ++maxL);
  const perLevel = new Map<number, string[]>();
  for (const s of a.states) { const l = level.get(s.id)!; perLevel.set(l, [...(perLevel.get(l) ?? []), s.id]); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of perLevel) ids.forEach((id, i) => pos.set(id, { x: 100 + 170 * l, y: 160 + (i - (ids.length - 1) / 2) * 140 }));
  return { ...a, states: a.states.map(s => ({ ...s, ...pos.get(s.id)! })) };
}

/** Parse "a, b, c" or "a b c" into symbols; keeps what the user typed so F-06 can explain problems. */
export function parseAlphabet(text: string): string[] {
  const parts = text.includes(",") ? text.split(",") : text.trim().split(/\s+/u);
  return parts.map(x => x.trim()).filter(x => x !== "");
}
