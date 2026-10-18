/**
 * The official test package (spec 11.2): every fixture in tests/fixtures is loaded and every expected
 * result is compared with the product engine. Fixtures are built by tools/build_fixtures.py; do not edit them by hand.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptedUpTo, acceptsEpsilon, type Automaton, completeToFull, counts, deadStates, Index, parseAutomatonFile,
  run, shortestAccepted, trapStates, tree, unreachableStates, validate, errorsOf,
} from "../src/index.js";

const DIR = join(import.meta.dirname, "fixtures");
const files = readdirSync(DIR).filter(f => f.endsWith(".json") && !f.startsWith("_")).sort();

interface Fixture {
  fixtureId: string;
  automaton: Automaton;
  verification: { sourceStatus: string };
  expected: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const load = (f: string): Fixture => JSON.parse(readFileSync(join(DIR, f), "utf8"));

it("the package has all 31 fixtures listed in the manifest", () => {
  const manifest = JSON.parse(readFileSync(join(DIR, "_manifest.json"), "utf8"));
  expect(files).toHaveLength(31);
  const listed = (manifest.fixtures ?? manifest).map((m: any) => (typeof m === "string" ? m : m.fixtureId ?? m.id)); // eslint-disable-line
  for (const f of files) expect(listed).toContain(f.replace(/\.json$/, ""));
});

describe.each(files)("%s", file => {
  const fx = load(file);
  const loaded = parseAutomatonFile(JSON.stringify(fx.automaton));
  if (!loaded.ok) throw new Error(loaded.message);
  const a = loaded.automaton;
  const ix = new Index(a);
  const L = (ids: string[]) => ids.map(id => ix.label(id));
  const e = fx.expected;

  it("loads and has no validation errors", () => {
    expect(errorsOf(validate(a))).toEqual([]);
  });

  it("matches every expected run", () => {
    for (const ex of e.runs) {
      const r = run(a, ex.word);
      const tag = JSON.stringify(ex.word);
      expect(r.accepted, tag).toBe(ex.accepted);
      expect(r.unread, `${tag} unread`).toEqual(ex.unreadSymbols);
      if ("path" in ex) {
        expect(L(r.path!), `${tag} path`).toEqual(ex.path);
        expect(r.stuck && { atIndex: r.stuck.atIndex, state: ix.label(r.stuck.stateId), symbol: r.stuck.symbol }, `${tag} stuck`).toEqual(ex.stuck);
      }
      if ("activeSets" in ex) {
        expect(r.steps.map(s => L(s.active)), `${tag} sets`).toEqual(ex.activeSets);
        expect(r.emptyAtIndex, `${tag} emptyAtIndex`).toBe(ex.emptyAtIndex);
        expect(r.oneAcceptingPath && L(r.oneAcceptingPath), `${tag} one accepting path`).toEqual(ex.oneAcceptingPath);
        const t = tree(a, ex.word);
        expect({ totalLeaves: t.totalLeaves, leaves: t.leaves, displayRule: t.displayRule, hidden: t.hidden }, `${tag} tree`)
          .toEqual({ totalLeaves: ex.tree.totalLeaves, leaves: ex.tree.leaves, displayRule: ex.tree.displayRule, hidden: ex.tree.hidden });
        if (ex.tree.displayRule === "acceptingOnly") expect(t.shown.map(l => L(l.path)), `${tag} shown`).toEqual(ex.tree.shownAcceptingPaths);
        else expect(t.shown).toHaveLength(ex.tree.totalLeaves);
      }
    }
  });

  it("matches the analysis tools (T-1, T-2, T-5, T-6, T-8, traps)", () => {
    expect(acceptsEpsilon(a)).toBe(e.acceptsEpsilon);
    expect(shortestAccepted(a)).toEqual(e.shortestAcceptedWords);
    expect(counts(a)).toEqual(e.counts);
    expect(L(unreachableStates(a))).toEqual(e.unreachableStates);
    expect(L(deadStates(a))).toEqual(e.deadStates);
    expect(L(trapStates(a))).toEqual(e.trapStates);
  });

  it("T-4 lists words by length then alphabet, consistent with the runner", () => {
    const { words } = acceptedUpTo(a, 4);
    for (const w of words) expect(run(a, w).accepted).toBe(true);
    const sh = e.shortestAcceptedWords as string[][];
    if (sh.length && sh[0]!.length <= 4) expect(words.filter(w => w.length === sh[0]!.length)).toEqual(sh);
  });

  if (e.completion) {
    it("T-7 completes to a full DFA as a copy", () => {
      const before = JSON.stringify(a);
      const c = completeToFull(a);
      expect(JSON.stringify(a)).toBe(before);
      expect(c.trapLabel).toBe(e.completion.newTrapLabelSuggested);
      expect(c.added).toEqual(e.completion.addedTransitions);
      expect(errorsOf(validate(c.automaton))).toEqual([]);
      expect(trapStates(c.automaton)).toContain(c.trapId);
    });
  }
});
