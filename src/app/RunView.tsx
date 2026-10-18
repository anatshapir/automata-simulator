import { useState } from "preact/hooks";
import type { Automaton } from "../model/automaton.js";
import { Graph } from "../editor/graph/Graph.js";
import { TransitionTable } from "../editor/transition-table/Table.js";
import { activeCells, stuckCells, Controls, PathLine, progressText, ResultCard, runHighlight, Tape, WordInput } from "./RunParts.js";
import { TreeView } from "./TreeView.js";
import type { Runner } from "./runner.js";

interface Props {
  a: Automaton;
  rn: Runner;
  svgRef: { current: SVGSVGElement | null };
  side: preact.ComponentChildren;
}

export function RunView({ a, rn, svgRef, side }: Props) {
  const nfa = a.type === "nfa";
  const [view, setView] = useState<"sets" | "tree">("sets");
  return (
    <div class="workspace">
      <aside class="side">
        <section class="card pad stack">
          <h2>המילה להרצה</h2>
          <WordInput a={a} rn={rn} />
        </section>
        <ResultCard a={a} rn={rn} />
        {rn.run && (
          <section class="card pad stack">
            <h2>{nfa ? "קבוצות המצבים הפעילים" : "המסלול"}</h2>
            <PathLine a={a} rn={rn} />
          </section>
        )}
        {side}
      </aside>
      <main class="main">
        <section class="card pad stack">
          <div class="between">
            <h2>סרט הקלט</h2>
            <div class="row">
              {nfa && (
                <div class="seg" role="group" aria-label="תצוגה">
                  <button type="button" class={view === "sets" ? "on" : ""} onClick={() => setView("sets")}>קבוצת מצבים</button>
                  <button type="button" class={view === "tree" ? "on" : ""} onClick={() => setView("tree")}>עץ חישוב</button>
                </div>
              )}
              <span class="small muted">{progressText(rn)}</span>
            </div>
          </div>
          <Tape rn={rn} />
          <Controls rn={rn} />
        </section>
        {nfa && view === "tree" && rn.run ? (
          <section class="card pad"><TreeView a={a} rn={rn} /></section>
        ) : (
          <section class="card">
            <div class="canvas" dir="ltr"><Graph a={a} editable={false} svgRef={svgRef} highlight={runHighlight(rn)} /></div>
          </section>
        )}
        <section class="card"><TransitionTable a={a} editable={false} activeCells={activeCells(rn)} errCells={stuckCells(rn)} /></section>
      </main>
    </div>
  );
}
