import { type Automaton, Index, isDeterministicType } from "../model/automaton.js";

/** Feedback catalog codes (spec 6) plus three structural checks the catalog has no code for. */
export type IssueCode =
  | "F-01" | "F-02" | "F-03" | "F-04" | "F-05" | "F-06" | "F-07" | "F-08" | "F-09" | "F-10"
  | "label-empty" | "label-duplicate" | "ref-unknown";

export type Severity = "error" | "warning";

export interface Issue {
  code: IssueCode;
  severity: Severity;
  message: string;
  stateId?: string;
  /** label of stateId, for tests and messages */
  state?: string;
  symbol?: string;
  transitionId?: string;
}

const EPS = "ε";

/** States that look like a trap by the course definition (spec 3.4). */
export function trapLikeStates(a: Automaton): string[] {
  const acc = new Set(a.acceptingStateIds);
  return a.states
    .filter(s => {
      if (acc.has(s.id)) return false;
      const out = a.transitions.filter(t => t.from === s.id);
      return out.some(t => t.to === s.id) && out.every(t => t.to === s.id);
    })
    .map(s => s.id);
}

export function reachableStates(a: Automaton): Set<string> {
  const seen = new Set<string>();
  if (!a.initialStateId || !a.states.some(s => s.id === a.initialStateId)) return seen;
  const stack = [a.initialStateId];
  while (stack.length) {
    const q = stack.pop()!;
    if (seen.has(q)) continue;
    seen.add(q);
    for (const t of a.transitions) if (t.from === q && !seen.has(t.to)) stack.push(t.to);
  }
  return seen;
}

/** Pure validation: a list of issues, each with a catalog code, severity and location (spec 10.1). */
export function validate(a: Automaton): Issue[] {
  const ix = new Index(a);
  const issues: Issue[] = [];
  const at = (stateId: string) => ({ stateId, state: ix.label(stateId) });

  // --- alphabet (F-01, F-06)
  const valid = new Set<string>();
  const seenSymbols = new Set<string>();
  for (const c of a.alphabet) {
    if (c === EPS) {
      issues.push({ code: "F-01", severity: "error", symbol: c, message: "ε היא מילה באורך 0, לא אות. אם ε בשפה, סמנו את המצב ההתחלתי כמקבל." });
      continue;
    }
    if (seenSymbols.has(c)) {
      issues.push({ code: "F-06", severity: "error", symbol: c, message: `הסמל ${c} מופיע באלפבית יותר מפעם אחת. כל סמל מופיע פעם אחת בלבד.` });
      continue;
    }
    seenSymbols.add(c);
    if (c === "") issues.push({ code: "F-06", severity: "error", symbol: c, message: "סמל לא יכול להיות ריק." });
    else if (c.includes(",")) issues.push({ code: "F-06", severity: "error", symbol: c, message: "סמל לא יכול להכיל פסיק, כי פסיק מפריד בין סמלים על החץ." });
    else if (/\s/u.test(c)) issues.push({ code: "F-06", severity: "error", symbol: c, message: "סמל לא יכול להכיל רווח, כי רווח מפריד בין סמלים כשמקלידים מילה." });
    else valid.add(c);
  }

  // --- start state (F-02)
  if (a.initialStateId === null || !ix.byId.has(a.initialStateId)) {
    issues.push({ code: "F-02", severity: "error", message: "לכל אוטומט יש מצב התחלתי אחד בדיוק." });
  }

  // --- labels
  const labels = new Map<string, string>();
  for (const s of a.states) {
    if (s.label.trim() === "") issues.push({ code: "label-empty", severity: "error", stateId: s.id, message: "לכל מצב צריך שם." });
    else if (labels.has(s.label)) issues.push({ code: "label-duplicate", severity: "error", ...at(s.id), message: `יש שני מצבים בשם ${s.label}. שמות המצבים צריכים להיות שונים.` });
    else labels.set(s.label, s.id);
  }
  for (const id of a.acceptingStateIds) {
    if (!ix.byId.has(id)) issues.push({ code: "ref-unknown", severity: "error", message: "אחד המצבים המקבלים לא קיים יותר." });
  }

  // --- transitions (F-01 on an arrow, F-05, references)
  for (const t of a.transitions) {
    if (!ix.byId.has(t.from) || !ix.byId.has(t.to)) {
      issues.push({ code: "ref-unknown", severity: "error", transitionId: t.id, message: "יש מעבר שמפנה למצב שלא קיים." });
      continue;
    }
    if (t.symbol === EPS) {
      issues.push({ code: "F-01", severity: "error", ...at(t.from), symbol: EPS, transitionId: t.id, message: "ε היא מילה באורך 0, לא אות. אם ε בשפה, סמנו את המצב ההתחלתי כמקבל." });
    } else if (!a.alphabet.includes(t.symbol)) {
      issues.push({ code: "F-05", severity: "error", ...at(t.from), symbol: t.symbol, transitionId: t.id, message: `המעבר מ-${ix.label(t.from)} ב-${t.symbol} משתמש בסמל שכבר אינו באלפבית.` });
    }
  }

  // --- determinism and completeness (F-03, F-04, F-07 with the precedence rule)
  if (isDeterministicType(a.type)) {
    const traps = new Set(trapLikeStates(a));
    for (const s of a.states) {
      for (const c of valid) {
        const n = ix.targets(s.id, c).length;
        if (n > 1) {
          issues.push({ code: "F-04", severity: "error", ...at(s.id), symbol: c, message: `מ-${s.label} יוצאים ${n === 2 ? "שני" : n} מעברים עם ${c} למצבים שונים. זה אי-דטרמיניזם.` });
        } else if (n === 0 && a.type === "dfa-full") {
          // Precedence (spec 6): one message per missing cell. Trap-like state -> F-07, otherwise F-03.
          if (traps.has(s.id)) {
            issues.push({ code: "F-07", severity: "error", ...at(s.id), symbol: c, message: `במלכודת ${s.label} חסרה לולאה על ${c}. גם במלכודת קוראים עד סוף המילה, ולכן יש בה לולאה על כל הסמלים.` });
          } else {
            issues.push({ code: "F-03", severity: "error", ...at(s.id), symbol: c, message: `מ-${s.label} חסר מעבר עבור ${c}. באוטומט מלא מכל מצב יוצא מעבר לכל סמל.` });
          }
        }
      }
    }
  }

  // --- warnings (F-08, F-09, F-10)
  if (a.initialStateId && ix.byId.has(a.initialStateId)) {
    const reach = reachableStates(a);
    for (const s of a.states) {
      if (!reach.has(s.id)) issues.push({ code: "F-08", severity: "warning", ...at(s.id), message: `אי אפשר להגיע ל-${s.label} מהמצב ההתחלתי.` });
    }
  }
  for (const s of a.states) {
    if (!s.memory || s.memory.trim() === "") issues.push({ code: "F-09", severity: "warning", ...at(s.id), message: `כתבו מה ${s.label} זוכר.` });
  }
  if (a.type === "nfa" && ![...ix.cells.values()].some(list => list.length > 1)) {
    issues.push({ code: "F-10", severity: "warning", message: "האוטומט סומן כלא דטרמיניסטי, אבל בפועל הוא דטרמיניסטי." });
  }
  return issues;
}

export const errorsOf = (issues: Issue[]) => issues.filter(i => i.severity === "error");
export const isRunnable = (a: Automaton) => errorsOf(validate(a)).length === 0;
