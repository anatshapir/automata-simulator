import { expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { QUESTIONS } from "../src/app/example-questions.js";

it("every example from the package has the question behind it", () => {
  const ids = readdirSync(join(import.meta.dirname, "fixtures")).filter(f => f.endsWith(".json") && !f.startsWith("_")).map(f => f.replace(/\.json$/, ""));
  for (const id of ids) expect(QUESTIONS[id]?.question, id).toMatch(/[֐-׿]/);
  expect(Object.keys(QUESTIONS).sort()).toEqual(ids.sort());
});

it("no long dashes in the example texts", () => {
  for (const q of Object.values(QUESTIONS)) expect(JSON.stringify(q)).not.toMatch(/[—–]/);
});
