import { useCallback, useState } from "preact/hooks";

/** Undo/redo for edits (spec 4.1). `coalesce` replaces the top entry (dragging a state). */
export function useHistory<T>(initial: T | (() => T)) {
  const [h, setH] = useState(() => ({ past: [] as T[], present: typeof initial === "function" ? (initial as () => T)() : initial, future: [] as T[], coalescing: false }));
  const set = useCallback((next: T | ((cur: T) => T), opts: { coalesce?: boolean; reset?: boolean } = {}) => {
    setH(cur => {
      const value = typeof next === "function" ? (next as (c: T) => T)(cur.present) : next;
      if (value === cur.present) return cur;
      if (opts.reset) return { past: [], present: value, future: [], coalescing: false };
      if (opts.coalesce && cur.coalescing) return { ...cur, present: value };
      return { past: [...cur.past.slice(-199), cur.present], present: value, future: [], coalescing: !!opts.coalesce };
    });
  }, []);
  const endCoalesce = useCallback(() => setH(cur => (cur.coalescing ? { ...cur, coalescing: false } : cur)), []);
  const undo = useCallback(() => setH(cur => cur.past.length
    ? { past: cur.past.slice(0, -1), present: cur.past.at(-1)!, future: [cur.present, ...cur.future], coalescing: false } : cur), []);
  const redo = useCallback(() => setH(cur => cur.future.length
    ? { past: [...cur.past, cur.present], present: cur.future[0]!, future: cur.future.slice(1), coalescing: false } : cur), []);
  return { value: h.present, set, undo, redo, endCoalesce, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
