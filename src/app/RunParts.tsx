import { type Automaton, Index } from "../model/automaton.js";
import { singleCharAlphabet } from "../engine/word.js";
import { edgeKey } from "../editor/graph/geometry.js";
import type { Highlight } from "../editor/graph/Graph.js";
import type { Runner } from "./runner.js";
import { IconBack, IconFwd, IconPause, IconPlay } from "./icons.js";

/** Word input (spec 5.1): free typing when every symbol is one character, symbol buttons always, explicit ε. */
export function WordInput({ a, rn, big = false }: { a: Automaton; rn: Runner; big?: boolean }) {
  const single = singleCharAlphabet(a.alphabet);
  const append = (c: string) => rn.setText(single ? rn.text.replace(/\s+/g, "") + c : (rn.text.trim() ? `${rn.text.trim()} ${c}` : c));
  const backspace = () => {
    if (single) rn.setText([...rn.text.replace(/\s+/g, "")].slice(0, -1).join(""));
    else rn.setText(rn.text.trim().split(/\s+/u).slice(0, -1).join(" "));
  };
  return (
    <div class="stack">
      <div class="word-row">
        <input class="input" aria-label="המילה להרצה" value={rn.text} placeholder={single ? "הקלידו מילה, למשל abba" : "סמלים מופרדים ברווח"}
          onInput={e => rn.setText((e.target as HTMLInputElement).value)} style={big ? { fontSize: "26px", minHeight: "56px" } : undefined} />
        <button type="button" class="btn" onClick={() => rn.setText("")} title="המילה הריקה">ε</button>
        <button type="button" class="btn" onClick={backspace} aria-label="מחיקת הסמל האחרון">⌫</button>
      </div>
      <div class="symbol-pad" aria-label="לחצני סמלים">
        {a.alphabet.map(c => <button type="button" key={c} class="chip" onClick={() => append(c)}>{c}</button>)}
      </div>
      {!single && <div class="small muted">יש באלפבית סמל של כמה תווים, ולכן מפרידים סמלים ברווח: <span class="mono ltr">{a.alphabet.slice(0, 3).join(" ")}</span></div>}
      {rn.issue && <div class="issue error"><span class="code">F-11</span><div>{rn.issue.message}</div></div>}
    </div>
  );
}

export function Tape({ rn, big = false }: { rn: Runner; big?: boolean }) {
  const w = rn.word;
  const r = rn.run;
  if (w.length === 0) return <div class="tape"><div class="cell cell-eps" title="המילה הריקה">ε</div><span class="small muted" style={{ alignSelf: "center" }} dir="rtl">המילה הריקה: מכריעים מיד לפי המצב ההתחלתי</span></div>;
  const stuckAt = r?.stuck && rn.done ? r.stuck.atIndex : null;
  const emptyAt = r?.emptyAtIndex !== null && r?.emptyAtIndex !== undefined && rn.done ? r.emptyAtIndex : null;
  return (
    <div class="tape" role="list" aria-label="סרט הקלט">
      {w.map((c, i) => {
        let cls = "cell";
        if (stuckAt !== null && i === stuckAt) cls += " stuck";
        else if (stuckAt !== null && i > stuckAt) cls += " unread";
        else if (emptyAt !== null && i > emptyAt) cls += " unread";
        else if (i < rn.step) cls += " read";
        else if (i === rn.step && !rn.done) cls += " next";
        const pointer = (i === rn.step && !rn.done) || i === stuckAt;
        return (
          <div class="cell-wrap" key={i} role="listitem">
            <svg width={big ? 24 : 16} height={big ? 18 : 12} viewBox="0 0 16 12" aria-hidden="true" style={{ visibility: pointer ? "visible" : "hidden" }}>
              <path d="M8 12L0 0h16z" fill={i === stuckAt ? "#B93A2B" : "#E8740C"} />
            </svg>
            <div class={cls}>{c}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Controls({ rn, big = false }: { rn: Runner; big?: boolean }) {
  const dis = !rn.run;
  return (
    <div class="controls">
      <button type="button" class="btn" disabled={dis} onClick={rn.reset} title="איפוס (Home)">איפוס</button>
      <button type="button" class="btn" disabled={dis || rn.step === 0} onClick={rn.back} title="צעד אחורה (←)"><IconBack />{big ? "" : "צעד אחורה"}</button>
      <button type="button" class="btn btn-primary" disabled={dis || rn.done} onClick={rn.forward} title="צעד קדימה (→)" style={big ? { minWidth: "220px" } : undefined}>צעד קדימה<IconFwd c="#fff" /></button>
      <button type="button" class="btn" disabled={dis} onClick={rn.toggle} title="הרצה רציפה (רווח)">{rn.playing ? <><IconPause />השהיה</> : <><IconPlay />הרצה רציפה</>}</button>
      {!big && (
        <label class="row small muted" style={{ gap: "6px" }} dir="rtl">מהירות
          <select class="input" style={{ width: "auto", minHeight: "36px" }} value={rn.speed} onChange={e => rn.setSpeed(Number((e.target as HTMLSelectElement).value))}>
            <option value={1500}>איטית</option><option value={900}>רגילה</option><option value={400}>מהירה</option>
          </select>
        </label>
      )}
      <button type="button" class="btn btn-ghost" disabled={dis || rn.done} onClick={rn.toEnd}>לסוף</button>
    </div>
  );
}

export function progressText(rn: Runner) {
  const n = rn.word.length;
  if (!rn.run) return "";
  const read = rn.run.status === "stuck" && rn.done ? rn.run.stuck!.atIndex : rn.step;
  return `נקראו ${read} מתוך ${n} סמלים`;
}

/** Path in class notation (spec 2.3): q0 -a-> q1 for a DFA, {q0} -a-> {q0,q1} for an NFA. */
export function PathLine({ a, rn }: { a: Automaton; rn: Runner }) {
  const r = rn.run;
  if (!r) return null;
  const ix = new Index(a);
  const nfa = a.type === "nfa";
  const shown = r.steps.slice(0, rn.step + 1);
  const name = (ids: string[]) => (nfa ? `{${ids.map(id => ix.label(id)).join(",")}}` : ix.label(ids[0]!));
  return (
    <div class="pathline">
      {shown.map((s, i) => (
        <span key={i}>
          {i > 0 && <span class="arrow"> -{r.word[i - 1]}-&gt; </span>}
          <span class={i === rn.step ? "cur" : ""}>{s.active.length || !nfa ? name(s.active) : "∅"}</span>
        </span>
      ))}
      {rn.done && r.status === "stuck" && <span style={{ color: "#B93A2B" }}> -{r.stuck!.symbol}-&gt; ✕</span>}
    </div>
  );
}

export function ResultCard({ a, rn }: { a: Automaton; rn: Runner }) {
  const r = rn.run;
  if (!r || !rn.done) return null;
  const ix = new Index(a);
  const verdict = { accepted: "המילה מתקבלת", rejected: "המילה נדחית", stuck: "נתקע · המילה נדחית", emptied: "אין מסלול · המילה נדחית" }[r.status];
  const icon = r.status === "accepted" ? "✓" : "✕";
  return (
    <section class={`result ${r.status}`} aria-live="polite">
      <div class="verdict"><span aria-hidden="true">{icon}</span>{verdict}</div>
      <div>{r.explanation.message}</div>
      {r.oneAcceptingPath && (
        <div class="stack" style={{ gap: "2px" }}>
          <div class="small muted">מסלול מקבל אחד:</div>
          <div class="pathline">{r.oneAcceptingPath.map((id, i) => <span key={i}>{i > 0 && <span class="arrow"> -{r.word[i - 1]}-&gt; </span>}{ix.label(id)}</span>)}</div>
        </div>
      )}
      {r.unread.length > 0 && <div class="small">נותרו סימנים לקריאה: <span class="mono ltr">{r.unread.join(" ")}</span></div>}
    </section>
  );
}

/** Graph highlighting for the current step. */
export function runHighlight(rn: Runner): Highlight {
  const r = rn.run;
  if (!r) return {};
  const s = r.steps[rn.step]!;
  const h: Highlight = { current: new Set(s.active), activeEdges: new Set(s.edges.map(e => edgeKey(e.from, e.to))) };
  if (rn.done && r.status === "stuck") h.stuck = r.stuck!.stateId;
  if (rn.done && r.oneAcceptingPath) {
    const p = r.oneAcceptingPath;
    h.pathStates = new Set(p);
    h.pathEdges = new Set(p.slice(1).map((to, i) => edgeKey(p[i]!, to)));
  }
  return h;
}

export function activeCells(rn: Runner): Set<string> {
  const r = rn.run;
  if (!r) return new Set();
  const s = r.steps[rn.step]!;
  return new Set(s.edges.map(e => `${e.from}\u0000${e.symbol}`));
}

/** The missing cell where a partial DFA got stuck (red, like an error). */
export function stuckCells(rn: Runner): Set<string> {
  const r = rn.run;
  return r && rn.done && r.status === "stuck" ? new Set([`${r.stuck!.stateId}\u0000${r.stuck!.symbol}`]) : new Set();
}
