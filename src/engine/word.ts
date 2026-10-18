import type { Word } from "../model/automaton.js";

/** F-11: a symbol in the typed word that is not in Σ. position is 0-based. */
export interface InputIssue {
  code: "F-11";
  symbol: string;
  position: number;
  message: string;
}

const ORDINALS = ["הראשון", "השני", "השלישי", "הרביעי", "החמישי", "השישי", "השביעי", "השמיני", "התשיעי", "העשירי"];
export const ordinal = (i: number) => ORDINALS[i] ?? `ה-${i + 1}`;

const chars = (s: string) => [...s];

/** True when every symbol is a single character; then words are typed freely, as in the notebook. */
export const singleCharAlphabet = (alphabet: string[]) => alphabet.every(c => chars(c).length === 1);

export const formatSet = (alphabet: string[]) => `{${alphabet.join(",")}}`;

export function wordIssue(word: Word, alphabet: string[], shown: string): InputIssue | null {
  const sigma = new Set(alphabet);
  const i = word.findIndex(c => !sigma.has(c));
  if (i < 0) return null;
  const c = word[i]!;
  return {
    code: "F-11", symbol: c, position: i,
    message: `${shown} אינה מילה מעל ${formatSet(alphabet)}: הסמל ${c} במקום ${ordinal(i)} אינו באלפבית.`,
  };
}

/**
 * Typed text -> word (spec 5.1).
 * Single-character alphabet: every character is a symbol; spaces are ignored ("abba", "a b b a").
 * Otherwise symbols are separated by spaces ("לחיצה לחיצה"); text is never split into characters,
 * so over {a, b, ab} "ab" is the symbol [ab] and "a b" is the word [a,b].
 */
export function parseWord(text: string, alphabet: string[]): { word: Word; issue: InputIssue | null } {
  const trimmed = text.trim();
  const word = trimmed === "" || trimmed === "ε"
    ? []
    : singleCharAlphabet(alphabet)
      ? chars(trimmed).filter(c => !/\s/u.test(c))
      : trimmed.split(/\s+/u);
  return { word, issue: wordIssue(word, alphabet, singleCharAlphabet(alphabet) ? word.join("") : word.join(" ")) };
}

/** How a word is written in messages: "aab", "לחיצה לחיצה", or ε. */
export function showWord(word: Word, alphabet: string[]): string {
  if (word.length === 0) return "ε";
  return singleCharAlphabet(alphabet) ? word.join("") : word.join(" ");
}
