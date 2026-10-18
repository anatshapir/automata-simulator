import type { Automaton } from "../model/automaton.js";

/** The verified examples from the course materials (the fixture package), offered as "examples". */
interface FixtureFile { fixtureId: string; source: { material: string; location: string; status: string }; automaton: Automaton; language?: { knownSourceDefect?: unknown } }

const files = import.meta.glob<FixtureFile>("../../tests/fixtures/*.json", { eager: true, import: "default" });

export interface Example { id: string; title: string; where: string; defect: boolean; automaton: Automaton }

export const EXAMPLES: Example[] = Object.entries(files)
  .filter(([path]) => !path.split("/").at(-1)!.startsWith("_"))
  .map(([, f]) => ({
    id: f.fixtureId,
    title: f.automaton.title ?? f.fixtureId,
    where: f.source.status === "synthetic" ? "מקרה בדיקה" : `${f.source.material}, ${f.source.location}`,
    defect: !!f.language?.knownSourceDefect,
    automaton: f.automaton,
  }))
  .sort((x, y) => order(x) - order(y) || x.id.localeCompare(y.id));

function order(e: Example) {
  if (e.id.startsWith("intro")) return 0;
  if (e.id.startsWith("sheet")) return 1;
  if (e.id.startsWith("partial")) return 2;
  if (e.id.startsWith("nfa")) return 3;
  return 4;
}
