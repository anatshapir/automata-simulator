import { describe, expect, it } from "vitest";
import {
  type Automaton, checkWords, acceptedUpTo, parseAutomatonFile, parseWord, run, serializeAutomaton, showWord, tree, validate, hiddenMessage,
} from "../src/index.js";

const st = (id: string, label = id, memory = "x") => ({ id, label, x: 0, y: 0, memory });
const tr = (rows: Array<[string, string, string]>) => rows.map(([from, symbol, to], i) => ({ id: `t${i}`, from, symbol, to }));
const make = (type: Automaton["type"], alphabet: string[], ids: string[], acc: string[], rows: Array<[string, string, string]>): Automaton => ({
  schemaVersion: 1, type, alphabet, states: ids.map(i => st(i)), initialStateId: ids[0]!, acceptingStateIds: acc, transitions: tr(rows),
});

// contains aa, over {a,b}
const containsAa = make("dfa-full", ["a", "b"], ["q0", "q1", "q2"], ["q2"], [
  ["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q2"], ["q1", "b", "q0"], ["q2", "a", "q2"], ["q2", "b", "q2"],
]);

describe("word input (spec 5.1)", () => {
  it("single-character alphabet: free typing, spaces ignored", () => {
    expect(parseWord("abba", ["a", "b"]).word).toEqual(["a", "b", "b", "a"]);
    expect(parseWord("a b", ["a", "b"]).word).toEqual(["a", "b"]);
  });
  it("ε and empty input are the empty word", () => {
    expect(parseWord("", ["a"]).word).toEqual([]);
    expect(parseWord("ε", ["a"]).word).toEqual([]);
  });
  it("{a, b, ab}: 'ab' is the symbol [ab] and 'a b' is [a,b]; never guessed", () => {
    const sigma = ["a", "b", "ab"];
    expect(parseWord("ab", sigma).word).toEqual(["ab"]);
    expect(parseWord("a b", sigma).word).toEqual(["a", "b"]);
    expect(showWord(["a", "b"], sigma)).not.toBe(showWord(["ab"], sigma));
  });
  it("multi-character symbols are separated by spaces", () => {
    expect(parseWord("לחיצה לחיצה", ["לחיצה"]).word).toEqual(["לחיצה", "לחיצה"]);
  });
  it("unknown symbol: F-11 with symbol and position", () => {
    expect(parseWord("abca", ["a", "b"]).issue).toMatchObject({ code: "F-11", symbol: "c", position: 2 });
  });
});

describe("runs", () => {
  it("decides only after the last symbol; passing an accepting state midway is F-13", () => {
    const passes = make("dfa-full", ["a", "b"], ["q0", "q1"], ["q1"], [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q0"], ["q1", "b", "q0"]]);
    const r = run(passes, ["a", "b"]);
    expect(r.accepted).toBe(false);
    expect(r.explanation.code).toBe("F-13");
  });
  it("trap is an ordinary state: reading continues to the end", () => {
    const withTrap = make("dfa-full", ["a", "b"], ["q0", "q1", "q2"], ["q1"], [
      ["q0", "a", "q1"], ["q0", "b", "q2"], ["q1", "a", "q1"], ["q1", "b", "q1"], ["q2", "a", "q2"], ["q2", "b", "q2"]]);
    const r = run(withTrap, ["b", "a", "a"]);
    expect(r.steps).toHaveLength(4);
    expect(r.unread).toEqual([]);
    expect(r.explanation.code).toBe("F-12");
  });
  it("ε is decided immediately by the start state", () => {
    expect(run(containsAa, []).steps).toHaveLength(1);
    expect(run(containsAa, []).accepted).toBe(false);
  });
  it("partial DFA stuck: F-14 and the stuck symbol stays unread", () => {
    const p = make("dfa-partial", ["a", "b"], ["q0", "q1"], ["q1"], [["q0", "a", "q1"]]);
    const r = run(p, ["a", "a", "b"]);
    expect(r.status).toBe("stuck");
    expect(r.unread).toEqual(["a", "b"]);
    expect(r.explanation.message).toBe("מ-q1 אין מעבר מתאים עבור a, ונותרו סימנים לקריאה. המילה נדחית.");
  });
  it("NFA: F-15 when some paths fail, F-16 when the set empties", () => {
    const n = make("nfa", ["a", "b"], ["q0", "q1"], ["q1"], [["q0", "a", "q0"], ["q0", "a", "q1"]]);
    expect(run(n, ["a", "a"]).explanation.code).toBe("F-15");
    const r = run(n, ["b", "a", "a"]);
    expect(r.status).toBe("emptied");
    expect(r.unread).toEqual(["a", "a"]);
    expect(r.explanation.code).toBe("F-16");
  });
  it("tree: hidden message by kind", () => {
    const n = make("nfa", ["a"], ["q0", "q1"], ["q1"], [["q0", "a", "q0"], ["q0", "a", "q1"], ["q1", "a", "q1"]]);
    const t = tree(n, Array(20).fill("a"));
    expect(t.displayRule).toBe("acceptingOnly");
    expect(hiddenMessage(t)).toMatch(/^הוסתרו \d+ ענפים: \d+ מקבלים, \d+ דוחים, \d+ נתקעו$/);
  });
});

describe("tools", () => {
  it("T-3 explains a wrong answer in the student's terms", () => {
    const [ok, wrong] = checkWords(containsAa, [{ word: ["a", "a"], expected: true }, { word: ["a", "b", "a"], expected: true }]);
    expect(ok!.correct).toBe(true);
    expect(wrong!.message).toBe("האוטומט שלך דוחה את aba, אבל היא בשפה.");
  });
  it("T-4 caps at 200 and says so", () => {
    const all = make("dfa-full", ["a", "b", "c"], ["q0"], ["q0"], [["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "c", "q0"]]);
    const r = acceptedUpTo(all, 5);
    expect(r.words).toHaveLength(200);
    expect(r.truncated).toBe(true);
    expect(r.words.slice(0, 5)).toEqual([[], ["a"], ["b"], ["c"], ["a", "a"]]);
  });
});

describe("work preservation", () => {
  it("a broken file is rejected without touching anything", () => {
    const r = parseAutomatonFile("{ not json");
    expect(r.ok).toBe(false);
  });
  it("unsupported schema version is rejected", () => {
    expect(parseAutomatonFile(JSON.stringify({ ...containsAa, schemaVersion: 2 })).ok).toBe(false);
  });
  it("an invalid automaton saves and reloads with the same errors", () => {
    const broken = { ...containsAa, transitions: containsAa.transitions.slice(1) };
    const before = validate(broken).map(i => i.code);
    const again = parseAutomatonFile(serializeAutomaton(broken));
    expect(again.ok && validate(again.automaton).map(i => i.code)).toEqual(before);
  });
  it("renaming a state does not disconnect transitions (ids, not labels)", () => {
    const renamed = { ...containsAa, states: containsAa.states.map(s => s.id === "q1" ? { ...s, label: "ראיתי a" } : s) };
    expect(run(renamed, ["a", "a"]).accepted).toBe(true);
  });
  it("changing the type keeps every transition and reports the new violations", () => {
    const asNfa = { ...containsAa, type: "nfa" as const };
    expect(asNfa.transitions).toEqual(containsAa.transitions);
    expect(validate(asNfa).map(i => i.code)).toContain("F-10");
  });
});
