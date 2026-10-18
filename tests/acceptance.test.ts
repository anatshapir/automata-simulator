/** Acceptance criteria from spec 11.1 that are checked at engine level (UI ones: tests/ui, run with Playwright). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptedUpTo, type Automaton, completeToFull, deadStates, Index, parseAutomatonFile, parseWord, run, serializeAutomaton,
  shortestAccepted, trapStates, validate,
} from "../src/index.js";
import { setAlphabet, setType } from "../src/editor/ops.js";

const fx = (id: string): Automaton => {
  const r = parseAutomatonFile(JSON.stringify(JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", `${id}.json`), "utf8")).automaton));
  if (!r.ok) throw new Error(r.message);
  return r.automaton;
};
const labels = (a: Automaton, ids: string[]) => ids.map(id => new Index(a).label(id));

describe("AC-22 T-2 returns every word of minimal length", () => {
  it("2 words in exercises 12 and 14", () => {
    expect(shortestAccepted(fx("sheet-ex12"))).toHaveLength(2);
    expect(shortestAccepted(fx("sheet-ex14")).map(w => w.join(""))).toEqual(["aabb", "abbb"]);
  });
  it("54 words in exercise 13", () => expect(shortestAccepted(fx("sheet-ex13"))).toHaveLength(54));
  it("ε in exercises 8 and 9", () => {
    expect(shortestAccepted(fx("sheet-ex08"))).toEqual([[]]);
    expect(shortestAccepted(fx("sheet-ex09"))).toEqual([[]]);
  });
});

it("AC-30 traps by the course definition (exercise 14: q4 and q9); a dead non-trap appears only in T-6", () => {
  const ex14 = fx("sheet-ex14");
  expect(labels(ex14, trapStates(ex14)).sort()).toEqual(["q4", "q9"]);
  const d = fx("synthetic-dead-not-trap");
  const dead = new Set(deadStates(d)), traps = new Set(trapStates(d));
  expect([...dead].some(id => !traps.has(id))).toBe(true);
});

it("AC-35 T-4 says the list was cut (exercise 13 up to length 4)", () => {
  expect(acceptedUpTo(fx("sheet-ex13"), 4).truncated).toBe(true);
});

describe("AC-27 multi-character symbols", () => {
  it("'עצירה' in the elevator is one symbol", () => {
    const a = fx("sheet-ex06-elevator-emergency");
    expect(a.alphabet).toContain("עצירה");
    const p = parseWord("עצירה", a.alphabet);
    expect(p.issue).toBeNull();
    expect(p.word).toEqual(["עצירה"]);
  });
  it("over {a,b,ab}, [ab] and [a,b] are chosen explicitly and both run", () => {
    const a = fx("synthetic-multichar-ambiguity");
    const one = run(a, parseWord("ab", a.alphabet).word);
    const two = run(a, parseWord("a b", a.alphabet).word);
    expect(one.word).toEqual(["ab"]);
    expect(two.word).toEqual(["a", "b"]);
  });
});

it("AC-34 changing the type shows the new violations; changing back restores everything", () => {
  const a = fx("partial-starts-with-ab");
  const full = setType(a, "dfa-full");
  expect(validate(full).map(i => i.code)).toContain("F-03");
  expect(setType(full, "dfa-partial")).toEqual(a);
});

it("AC-19 removing a symbol marks its transitions (F-05) and keeps them", () => {
  const a = fx("intro-contains-aa");
  const b = setAlphabet(a, a.alphabet.filter(c => c !== "c"));
  expect(b.transitions).toHaveLength(a.transitions.length);
  expect(validate(b).filter(i => i.code === "F-05").length).toBeGreaterThan(0);
});

it("AC-16 every fixture saves and loads back unchanged, task included", () => {
  const a: Automaton = { ...fx("sheet-ex07"), testWords: [{ word: ["a", "b"], expected: true }], task: { prompt: "מעקב", kind: "trace", tools: ["T-1", "T-3"], locked: true } };
  const back = parseAutomatonFile(serializeAutomaton(a));
  expect(back.ok && back.automaton).toEqual(a);
});

it("AC-07 completion equals the fixture and leaves the original untouched", () => {
  const a = fx("partial-starts-with-ab");
  const copy = structuredClone(a);
  const c = completeToFull(a);
  expect(a).toEqual(copy);
  expect(c.automaton.type).toBe("dfa-full");
  expect(trapStates(c.automaton)).toEqual([c.trapId]);
});

it("AC-12 ε is decided with no transition steps", () => {
  for (const id of ["sheet-ex08", "sheet-ex07", "nfa-slide33"]) {
    const a = fx(id);
    const r = run(a, []);
    expect(r.steps).toHaveLength(1);
    expect(r.accepted).toBe(a.acceptingStateIds.includes(a.initialStateId!));
  }
});
