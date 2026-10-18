import { useEffect, useMemo, useState } from "preact/hooks";
import type { Automaton, Word } from "../model/automaton.js";
import { run, type Run } from "../engine/run.js";
import { parseWord, showWord } from "../engine/word.js";

/** Run state lives outside the automaton (spec 5.2): a word, a precomputed run, and a cursor over its steps. */
export function useRunner(a: Automaton, runnable: boolean) {
  const [text, setTextRaw] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(900);

  const parsed = useMemo(() => parseWord(text, a.alphabet), [text, a.alphabet]);
  const r: Run | null = useMemo(() => (runnable && !parsed.issue ? run(a, parsed.word) : null), [a, runnable, parsed]);
  const last = r ? r.steps.length - 1 : 0;

  // The cursor belongs to one run: changing the word (or the automaton) cancels the run at once.
  const [cursor, setCursor] = useState<{ run: Run | null; step: number }>({ run: null, step: 0 });
  const step = cursor.run === r ? cursor.step : 0;
  const setStep = (f: number | ((s: number) => number)) =>
    setCursor(c => ({ run: r, step: typeof f === "function" ? f(c.run === r ? c.step : 0) : f }));
  useEffect(() => { setPlaying(false); }, [r]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) { setPlaying(false); return; }
    const id = setTimeout(() => setStep(s => Math.min(s + 1, last)), speed);
    return () => clearTimeout(id);
  }, [playing, step, last, speed]);

  return {
    text, word: parsed.word, issue: parsed.issue, run: r, step, last, playing, speed,
    setText: (t: string) => setTextRaw(t),
    setWord: (w: Word) => setTextRaw(showWord(w, a.alphabet) === "ε" ? "" : showWord(w, a.alphabet)),
    forward: () => setStep(s => Math.min(s + 1, last)),
    back: () => { setPlaying(false); setStep(s => Math.max(s - 1, 0)); },
    reset: () => { setPlaying(false); setStep(0); },
    toEnd: () => { setPlaying(false); setStep(last); },
    toggle: () => { if (step >= last) setStep(0); setPlaying(p => !p); },
    setSpeed,
    done: !!r && step >= last,
  };
}

export type Runner = ReturnType<typeof useRunner>;
