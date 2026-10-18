/**
 * The automaton model. This is exactly the frozen file schema (spec 10.2, schemaVersion 1):
 * what is saved to `.automaton.json` is this object, and every fixture is written in it.
 */

export type AutomatonType = "dfa-full" | "dfa-partial" | "nfa";

export const TYPE_NAMES: Record<AutomatonType, string> = {
  "dfa-full": "אסד״מ",
  "dfa-partial": "אס״ד לא מלא",
  "nfa": "א״ס לא דטרמיניסטי",
};

export interface State {
  /** Stable internal identity (s0, s1, ...). Never shown; never derived from the label. */
  id: string;
  /** The name the student sees (q0, "אור דולק"). Unique in the automaton. */
  label: string;
  x: number;
  y: number;
  /** "What does this state remember?" Missing or empty gives warning F-09. */
  memory?: string;
}

/** One transition consumes exactly one alphabet symbol. An arrow labelled a,b is two transitions. */
export interface Transition {
  id: string;
  from: string;
  symbol: string;
  to: string;
}

/** A word is always a sequence of symbols; [] is ε. */
export type Word = string[];

export interface TestWord {
  word: Word;
  /** true = the word is in the language (should be accepted). */
  expected: boolean;
}

export type ToolCode = "T-1" | "T-2" | "T-3" | "T-4" | "T-5" | "T-6" | "T-7" | "T-8" | "T-9";
export const ALL_TOOLS: ToolCode[] = ["T-1", "T-2", "T-3", "T-4", "T-5", "T-6", "T-7", "T-8", "T-9"];

export type TaskKind = "describe" | "trace" | "table" | "build" | "language";
export const TASK_KIND_NAMES: Record<TaskKind, string> = {
  describe: "תיאור מערכת",
  trace: "מעקב",
  table: "מטבלה לאוטומט",
  build: "בנייה לשפה",
  language: "מאוטומט לשפה",
};

export interface Task {
  prompt: string;
  kind: TaskKind;
  tools: ToolCode[];
  /** UI lock only (type, alphabet and, when true, the automaton). Not a security mechanism. */
  locked: boolean;
}

export interface Automaton {
  schemaVersion: 1;
  type: AutomatonType;
  title?: string;
  alphabet: string[];
  states: State[];
  /** null only while the student has not chosen one yet (F-02). */
  initialStateId: string | null;
  acceptingStateIds: string[];
  transitions: Transition[];
  testWords?: TestWord[];
  task?: Task;
}

export const isDeterministicType = (t: AutomatonType) => t === "dfa-full" || t === "dfa-partial";

export function emptyAutomaton(type: AutomatonType = "dfa-full"): Automaton {
  return {
    schemaVersion: 1,
    type,
    alphabet: ["a", "b"],
    states: [{ id: "s0", label: "q0", x: 140, y: 160, memory: "" }],
    initialStateId: "s0",
    acceptingStateIds: [],
    transitions: [],
  };
}

/** Lookup helpers shared by validation, engine and UI. */
export class Index {
  readonly byId = new Map<string, State>();
  readonly accepting: Set<string>;
  /** "from\u0000symbol" -> distinct targets, in transition order */
  readonly cells = new Map<string, string[]>();

  constructor(readonly a: Automaton) {
    for (const s of a.states) this.byId.set(s.id, s);
    this.accepting = new Set(a.acceptingStateIds);
    for (const t of a.transitions) {
      const k = cellKey(t.from, t.symbol);
      const list = this.cells.get(k) ?? [];
      if (!list.includes(t.to)) list.push(t.to);
      this.cells.set(k, list);
    }
  }
  label(id: string): string {
    return this.byId.get(id)?.label ?? id;
  }
  targets(from: string, symbol: string): string[] {
    return this.cells.get(cellKey(from, symbol)) ?? [];
  }
  /** States in automaton order (the "order of states" used for tie-breaking everywhere). */
  order(ids: Iterable<string>): string[] {
    const set = new Set(ids);
    return this.a.states.map(s => s.id).filter(id => set.has(id));
  }
}

export const cellKey = (from: string, symbol: string) => `${from}\u0000${symbol}`;

/**
 * Normalise an automaton after load or edit: an identical transition (from, symbol, to)
 * is kept once (spec 3.1). Nothing else is removed, so errors stay visible.
 */
export function normalize(a: Automaton): Automaton {
  const seen = new Set<string>();
  const transitions = a.transitions.filter(t => {
    const k = `${t.from}\u0000${t.symbol}\u0000${t.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return transitions.length === a.transitions.length ? a : { ...a, transitions };
}

export function nextId(prefix: "s" | "t", used: Iterable<string>): string {
  const set = new Set(used);
  let i = 0;
  while (set.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function nextLabel(a: Automaton): string {
  const used = new Set(a.states.map(s => s.label));
  let i = 0;
  while (used.has(`q${i}`)) i++;
  return `q${i}`;
}
