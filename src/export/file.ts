import { ALL_TOOLS, type Automaton, normalize, TASK_KIND_NAMES } from "../model/automaton.js";

export const FILE_EXTENSION = ".automaton.json";

export type LoadResult = { ok: true; automaton: Automaton } | { ok: false; message: string };

const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Checks structure and schema version before anything replaces the open work (spec 9).
 * A broken file is rejected; an invalid automaton (e.g. a missing transition) loads, and its errors show.
 */
export function parseAutomatonFile(text: string): LoadResult {
  let d: unknown;
  try { d = JSON.parse(text); } catch { return { ok: false, message: "הקובץ פגום: זה לא קובץ JSON תקין. האוטומט הפתוח לא השתנה." }; }
  if (!isObj(d)) return bad("אין בקובץ אוטומט.");
  if (d.schemaVersion !== 1) return bad(`גרסת קובץ ${String(d.schemaVersion)} אינה נתמכת (נתמכת גרסה 1).`);
  if (d.type !== "dfa-full" && d.type !== "dfa-partial" && d.type !== "nfa") return bad("סוג האוטומט בקובץ אינו מוכר.");
  if (!Array.isArray(d.alphabet) || !d.alphabet.every(isStr)) return bad("האלפבית בקובץ אינו רשימת סמלים.");
  if (!Array.isArray(d.states) || !d.states.every(s => isObj(s) && isStr(s.id) && isStr(s.label) && isNum(s.x) && isNum(s.y) && (s.memory === undefined || isStr(s.memory))))
    return bad("רשימת המצבים בקובץ פגומה.");
  if (!(d.initialStateId === null || isStr(d.initialStateId))) return bad("המצב ההתחלתי בקובץ פגום.");
  if (!Array.isArray(d.acceptingStateIds) || !d.acceptingStateIds.every(isStr)) return bad("רשימת המצבים המקבלים פגומה.");
  if (!Array.isArray(d.transitions) || !d.transitions.every(t => isObj(t) && isStr(t.id) && isStr(t.from) && isStr(t.symbol) && isStr(t.to)))
    return bad("רשימת המעברים בקובץ פגומה.");
  if (d.title !== undefined && !isStr(d.title)) return bad("כותרת האוטומט פגומה.");
  if (d.testWords !== undefined && !(Array.isArray(d.testWords) && d.testWords.every(w => isObj(w) && Array.isArray(w.word) && w.word.every(isStr) && typeof w.expected === "boolean")))
    return bad("מילות הבדיקה בקובץ פגומות.");
  if (d.task !== undefined) {
    const t = d.task;
    if (!isObj(t) || !isStr(t.prompt) || !(isStr(t.kind) && t.kind in TASK_KIND_NAMES) || typeof t.locked !== "boolean" ||
      !Array.isArray(t.tools) || !t.tools.every(x => isStr(x) && (ALL_TOOLS as string[]).includes(x)))
      return bad("הגדרות המשימה בקובץ פגומות.");
  }
  const ids = new Set((d.states as Array<{ id: string }>).map(s => s.id));
  if (ids.size !== (d.states as unknown[]).length) return bad("יש בקובץ שני מצבים עם אותו מזהה.");
  return { ok: true, automaton: normalize(d as unknown as Automaton) };
}

const bad = (why: string): LoadResult => ({ ok: false, message: `לא ניתן לטעון את הקובץ: ${why} האוטומט הפתוח לא השתנה.` });

/** Saved exactly in the schema; run history is never saved. */
export function serializeAutomaton(a: Automaton): string {
  const out: Automaton = {
    schemaVersion: 1,
    type: a.type,
    ...(a.title ? { title: a.title } : {}),
    alphabet: a.alphabet,
    states: a.states,
    initialStateId: a.initialStateId,
    acceptingStateIds: a.acceptingStateIds,
    transitions: a.transitions,
    ...(a.testWords?.length ? { testWords: a.testWords } : {}),
    ...(a.task ? { task: a.task } : {}),
  };
  return JSON.stringify(out, null, 2);
}
