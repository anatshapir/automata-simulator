import type { Automaton } from "../model/automaton.js";
import { parseAutomatonFile, serializeAutomaton } from "./file.js";

/**
 * Local draft in this browser only (spec 4.2): saved after every change, offered back on the next visit,
 * never overwrites silently, and can be deleted. Storage may be unavailable (private mode); then nothing happens.
 */
const KEY = "automata-simulator:draft:v1";

export interface Draft { automaton: Automaton; savedAt: number }

export function saveDraft(a: Automaton) {
  try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), file: serializeAutomaton(a) })); } catch { /* storage unavailable */ }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { savedAt: number; file: string };
    const r = parseAutomatonFile(d.file);
    return r.ok ? { automaton: r.automaton, savedAt: d.savedAt } : null;
  } catch { return null; }
}

export function deleteDraft() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
