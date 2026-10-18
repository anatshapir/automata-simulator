import type { Automaton, Word } from "../model/automaton.js";
import { type ExampleQuestion, QUESTIONS } from "./example-questions.js";

/** The verified examples from the course materials (the fixture package), offered as "examples". */
interface FixtureFile { fixtureId: string; source: { material: string; location: string; status: string }; automaton: Automaton; language?: { knownSourceDefect?: { shortestCounterexample?: Word } }; expected: { runs: Array<{ word: Word; statedInSource: boolean }> } }

const files = import.meta.glob<FixtureFile>("../../tests/fixtures/*.json", { eager: true, import: "default" });

export interface Example { id: string; title: string; where: string; defect: boolean; automaton: Automaton; q: ExampleQuestion | null; tryWords: Word[] }

export const EXAMPLES: Example[] = Object.entries(files)
  .filter(([path]) => !path.split("/").at(-1)!.startsWith("_"))
  .map(([, f]) => ({
    id: f.fixtureId,
    title: f.automaton.title ?? f.fixtureId,
    where: f.source.status === "synthetic" ? "מקרה בדיקה" : `${f.source.material}, ${f.source.location}`,
    defect: !!f.language?.knownSourceDefect,
    automaton: f.automaton,
    q: QUESTIONS[f.fixtureId] ?? null,
    tryWords: dedupe([...(f.language?.knownSourceDefect?.shortestCounterexample ? [{ word: f.language.knownSourceDefect.shortestCounterexample, statedInSource: true }] : []), ...f.expected.runs.filter(r => r.statedInSource), ...f.expected.runs.filter(r => !r.statedInSource)].map(r => r.word)).slice(0, 5),
  }))
  .sort((x, y) => order(x) - order(y) || x.id.localeCompare(y.id));

function order(e: Example) {
  if (e.id.startsWith("intro")) return 0;
  if (e.id.startsWith("sheet")) return 1;
  if (e.id.startsWith("partial")) return 2;
  if (e.id.startsWith("nfa")) return 3;
  return 4;
}

function dedupe(ws: Word[]): Word[] {
  const seen = new Set<string>();
  return ws.filter(w => { const k = JSON.stringify(w); if (seen.has(k)) return false; seen.add(k); return true; });
}
