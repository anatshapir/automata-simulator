import { useEffect } from "preact/hooks";
import { type Automaton, TYPE_NAMES } from "../model/automaton.js";
import { Graph } from "../editor/graph/Graph.js";
import { formatSet } from "../engine/word.js";
import { Controls, progressText, runHighlight, Tape } from "./RunParts.js";
import type { Runner } from "./runner.js";
import { Index } from "../model/automaton.js";

/**
 * Presentation mode (spec 8): side panel, table and tools hidden; drawing and tape enlarged; run controls kept.
 * No answers on the side, so the class can be asked. Esc leaves.
 */
export function Present({ a, rn, running, onExit }: { a: Automaton; rn: Runner; running: boolean; onExit: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onExit]);
  const ix = new Index(a);
  const r = rn.run;
  const cur = r?.steps[rn.step];
  return (
    <div class="present" role="dialog" aria-label="מצב הצגה">
      <header>
        <div class="t">{a.title || "אוטומט"}</div>
        <div class="s">{TYPE_NAMES[a.type]} · <span class="mono ltr">Σ = {formatSet(a.alphabet)}</span></div>
        <div class="spacer" />
        <button type="button" class="btn" onClick={onExit} style={{ fontSize: "18px", minHeight: "50px" }}>יציאה ממצב הצגה <span class="mono small muted">Esc</span></button>
      </header>
      <div class="stage">
        <div class="canvas" dir="ltr"><Graph a={a} editable={false} minScreenFont={30} highlight={running ? runHighlight(rn) : {}} /></div>
        {running && r && (
          <>
            <div class="row" style={{ justifyContent: "center", gap: "28px 48px" }}>
              <Tape rn={rn} big />
              <div class="status">
                <div>{rn.done
                  ? (r.accepted ? "המילה מתקבלת ✓" : r.status === "stuck" ? "נתקע · המילה נדחית" : "המילה נדחית")
                  : <>{a.type === "nfa" ? "במצבים " : "במצב "}<span class="mono ltr" style={{ fontWeight: 600 }}>{a.type === "nfa" ? `{${cur!.active.map(id => ix.label(id)).join(",")}}` : ix.label(cur!.active[0]!)}</span></>}</div>
                <div class="s2">{progressText(rn)}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}><Controls rn={rn} big /></div>
          </>
        )}
        {running && !r && <div class="status" style={{ textAlign: "center" }}>הקלידו מילה במסך ההרצה ואז חזרו למצב הצגה.</div>}
      </div>
    </div>
  );
}
