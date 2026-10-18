/**
 * The 14 validation cases + input cases (_validation-cases.json).
 * Rule: the errors are exactly the expected errors (code, severity and every location field given);
 * expected warnings must appear; codes in mustNotInclude must not appear at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Automaton, errorsOf, type Issue, isRunnable, parseAutomatonFile, parseWord, validate } from "../src/index.js";

const data = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "_validation-cases.json"), "utf8"));

interface Expected { code: string; severity: string; state?: string; symbol?: string }
const matches = (i: Issue, e: Expected) =>
  i.code === e.code && i.severity === e.severity &&
  (e.state === undefined || i.state === e.state) && (e.symbol === undefined || i.symbol === e.symbol);

describe.each(data.cases as Array<{ caseId: string; automaton: Automaton; expectedIssues: Expected[]; runnable: boolean; mustNotInclude?: string[]; expectedTransitionCountAfterLoad?: number }>)(
  "$caseId", c => {
    const loaded = parseAutomatonFile(JSON.stringify(c.automaton));
    it("loads (an invalid automaton is not a broken file)", () => expect(loaded.ok).toBe(true));
    if (!loaded.ok) return;
    const a = loaded.automaton;
    const issues = validate(a);

    it("produces exactly the expected errors", () => {
      const wantErrors = c.expectedIssues.filter(e => e.severity === "error");
      for (const e of wantErrors) expect(issues.some(i => matches(i, e)), JSON.stringify(e)).toBe(true);
      for (const i of errorsOf(issues)) expect(wantErrors.some(e => matches(i, e)), `unexpected ${i.code} ${i.state ?? ""} ${i.symbol ?? ""}`).toBe(true);
    });
    it("includes the expected warnings", () => {
      for (const e of c.expectedIssues.filter(e => e.severity === "warning")) expect(issues.some(i => matches(i, e)), JSON.stringify(e)).toBe(true);
    });
    if (c.mustNotInclude) it(`never includes ${c.mustNotInclude.join(", ")}`, () => {
      for (const code of c.mustNotInclude!) expect(issues.map(i => i.code)).not.toContain(code);
    });
    it(`is ${c.runnable ? "" : "not "}runnable`, () => expect(isRunnable(a)).toBe(c.runnable));
    if (c.expectedTransitionCountAfterLoad !== undefined) it("keeps an identical transition once", () =>
      expect(a.transitions).toHaveLength(c.expectedTransitionCountAfterLoad!));
    it("every message is Hebrew text", () => { for (const i of issues) expect(i.message).toMatch(/[֐-׿]/); });
  });

describe("input cases (F-11)", () => {
  const { automaton, words } = data.inputCases;
  for (const w of words) it(w.typed, () => {
    const { issue } = parseWord(w.typed, automaton.alphabet);
    if (w.expectedIssue === null) expect(issue).toBeNull();
    else {
      expect(issue).toMatchObject(w.expectedIssue);
      expect(issue!.message).toBe("0312 אינה מילה מעל {0,1,2}: הסמל 3 במקום השני אינו באלפבית.");
    }
  });
});
