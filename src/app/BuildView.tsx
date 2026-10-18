import { useEffect, useMemo, useState } from "preact/hooks";
import { type Automaton, type AutomatonType, TYPE_NAMES } from "../model/automaton.js";
import type { Issue } from "../validation/validate.js";
import { type CanvasTool, Graph } from "../editor/graph/Graph.js";
import { edgeKey } from "../editor/graph/geometry.js";
import { FormalDefinition, TransitionTable, Triples, tableAsText } from "../editor/transition-table/Table.js";
import { addState, autoLayout, deleteState, moveState, parseAlphabet, patchState, setAlphabet, setCell, setEdgeSymbols, setInitial, setType, toggleAccepting } from "../editor/ops.js";
import { IconRedo, IconUndo, LockIcon } from "./icons.js";

export interface EditApi {
  a: Automaton;
  set: (next: Automaton | ((a: Automaton) => Automaton), opts?: { coalesce?: boolean }) => void;
  endCoalesce: () => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}

interface Props {
  edit: EditApi;
  issues: Issue[];
  /** task.locked in student view: the automaton is shown but not edited */
  readOnly: boolean;
  /** a task fixes the type and the alphabet in student view */
  lockTypeAlphabet: boolean;
  svgRef: { current: SVGSVGElement | null };
  tools: preact.ComponentChildren;
  toast: (msg: string, err?: boolean) => void;
}

export function BuildView({ edit, issues, readOnly, lockTypeAlphabet, svgRef, tools, toast }: Props) {
  const a = edit.a;
  const [tool, setTool] = useState<CanvasTool>("select");
  const [sel, setSel] = useState<string | null>(null);
  const [edge, setEdge] = useState<{ from: string; to: string; x: number; y: number } | null>(null);
  const [tab, setTab] = useState<"table" | "triples" | "formal">("table");

  useEffect(() => { if (sel && !a.states.some(s => s.id === sel)) setSel(null); }, [a, sel]);

  const errStates = useMemo(() => new Set(issues.filter(i => i.severity === "error" && i.stateId).map(i => i.stateId!)), [issues]);
  const errCells = useMemo(() => new Set(issues.filter(i => ["F-03", "F-04", "F-07"].includes(i.code) && i.stateId && i.symbol !== undefined).map(i => `${i.stateId}\u0000${i.symbol}`)), [issues]);
  const errEdges = useMemo(() => {
    const ids = new Set(issues.filter(i => i.transitionId).map(i => i.transitionId));
    return new Set(a.transitions.filter(t => ids.has(t.id)).map(t => edgeKey(t.from, t.to)));
  }, [issues, a]);

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const state = a.states.find(s => s.id === sel) ?? null;

  const onAddState = (x: number, y: number) => {
    const r = addState(a, x, y);
    edit.set(r.a);
    setSel(r.id);
    setTool("select");
  };

  return (
    <div class="workspace">
      <aside class="side">
        <section class="card pad stack">
          <div class="between"><h2>סוג האוטומט</h2>{lockTypeAlphabet && <span class="lock"><LockIcon />נקבע במשימה</span>}</div>
          <div class="opt-grid">
            {(Object.keys(TYPE_NAMES) as AutomatonType[]).map(t => (
              <button type="button" key={t} class={`opt${a.type === t ? " on" : ""}`} disabled={lockTypeAlphabet || readOnly}
                onClick={() => edit.set(x => setType(x, t))} aria-pressed={a.type === t}>{TYPE_NAMES[t]}</button>
            ))}
          </div>
          <AlphabetField a={a} disabled={lockTypeAlphabet || readOnly} onChange={alpha => edit.set(x => setAlphabet(x, alpha))} />
        </section>

        <section class="card pad stack" aria-live="polite">
          <div class="between">
            <h2>בדיקת תקינות · {TYPE_NAMES[a.type]}</h2>
            <span class="small muted">{errors.length ? `${errors.length} שגיאות` : "אין שגיאות"}{warnings.length ? ` · ${warnings.length} אזהרות` : ""}</span>
          </div>
          {issues.length === 0 && <div class="ok-line">✓ האוטומט תקין ואפשר להריץ</div>}
          {[...errors, ...warnings].map((i, n) => (
            <div key={n} class={`issue ${i.severity}`} role={i.stateId ? "button" : undefined} tabIndex={i.stateId ? 0 : undefined}
              onClick={() => i.stateId && setSel(i.stateId)} style={{ cursor: i.stateId ? "pointer" : "default" }}>
              <span aria-hidden="true" style={{ fontWeight: 700, color: i.severity === "error" ? "#B93A2B" : "#B45F06" }}>{i.severity === "error" ? "●" : "▲"}</span>
              <div class="stack" style={{ gap: "4px" }}>
                <div>{i.message}</div>
                <div><span class="code">{i.code}</span> <span class="small muted">{i.severity === "error" ? "שגיאה, חוסמת הרצה" : "אזהרה, אפשר להריץ"}</span></div>
              </div>
            </div>
          ))}
          {errors.length > 0 && <div class="small muted">אפשר לשמור גם אוטומט לא תקין. השגיאות יסומנו שוב בפתיחה הבאה.</div>}
        </section>

        {state && !readOnly && (
          <section class="card pad stack">
            <h2>מצב נבחר</h2>
            <label class="field">שם המצב
              <input class="input mono" dir="auto" value={state.label} onInput={e => edit.set(x => patchState(x, state.id, { label: (e.target as HTMLInputElement).value }), { coalesce: true })} onBlur={edit.endCoalesce} />
            </label>
            <label class="field">מה המצב זוכר?
              <textarea class="input" value={state.memory ?? ""} placeholder="למשל: האות האחרונה הייתה a"
                onInput={e => edit.set(x => patchState(x, state.id, { memory: (e.target as HTMLTextAreaElement).value }), { coalesce: true })} onBlur={edit.endCoalesce} />
            </label>
            <div class="row">
              <button type="button" class="btn btn-sm" disabled={a.initialStateId === state.id} onClick={() => edit.set(x => setInitial(x, state.id))}>
                {a.initialStateId === state.id ? "→ מצב התחלתי" : "סימון כמצב התחלתי"}
              </button>
              <button type="button" class="btn btn-sm" aria-pressed={a.acceptingStateIds.includes(state.id)} onClick={() => edit.set(x => toggleAccepting(x, state.id))}>
                {a.acceptingStateIds.includes(state.id) ? "◎ מקבל (ביטול)" : "סימון כמקבל"}
              </button>
              <button type="button" class="btn btn-sm btn-danger" onClick={() => {
                const warn = state.id === a.initialStateId ? " זה היה המצב ההתחלתי." : a.acceptingStateIds.includes(state.id) ? " זה היה מצב מקבל." : "";
                edit.set(x => deleteState(x, state.id));
                toast(`${state.label} נמחק יחד עם המעברים שלו.${warn} אפשר לבטל.`);
              }}>מחיקה</button>
            </div>
          </section>
        )}

        <section class="card pad stack">
          <h2>מקרא: מה כל מצב זוכר</h2>
          {a.states.map(s => (
            <div class="legend-row" key={s.id}>
              <span class="lbl">{s.label}</span>
              {readOnly ? <span>{s.memory || <span class="muted">לא נכתב</span>}</span> : (
                <input class="input" value={s.memory ?? ""} placeholder="מה המצב זוכר?" aria-label={`מה ${s.label} זוכר`}
                  style={!s.memory?.trim() ? { borderColor: "#F3D3A6", background: "#FFFBF4" } : undefined}
                  onInput={e => edit.set(x => patchState(x, s.id, { memory: (e.target as HTMLInputElement).value }), { coalesce: true })} onBlur={edit.endCoalesce} />
              )}
            </div>
          ))}
        </section>
        {tools}
      </aside>

      <main class="main">
        <section class="card" style={{ position: "relative" }}>
          <div class="canvas" dir="ltr">
            <Graph a={a} editable={!readOnly} tool={tool} svgRef={svgRef} selectedState={sel} selectedEdge={edge ? edgeKey(edge.from, edge.to) : null}
              highlight={{ errStates, errEdges }}
              onMove={(id, x, y, done) => { edit.set(cur => moveState(cur, id, x, y), { coalesce: true }); if (done) edit.endCoalesce(); }}
              onSelectState={id => { setSel(id); setEdge(null); }}
              onAddState={onAddState}
              onAddEdge={(from, to, at) => { setEdge({ from, to, ...at }); setTool("select"); }}
              onSelectEdge={(from, to, at) => setEdge({ from, to, ...at })} />
            {!readOnly && (
              <div class="canvas-tools">
                <div class="seg" role="group" aria-label="כלי ציור">
                  <button type="button" class={tool === "select" ? "on" : ""} onClick={() => setTool("select")}>בחירה והזזה</button>
                  <button type="button" class={tool === "state" ? "on" : ""} onClick={() => setTool("state")}>+ מצב</button>
                  <button type="button" class={tool === "edge" ? "on" : ""} onClick={() => setTool("edge")}>+ מעבר</button>
                </div>
                <button type="button" class="btn btn-sm" onClick={() => edit.set(autoLayout)}>סידור משמאל לימין</button>
                <button type="button" class="btn btn-sm" disabled={!edit.canUndo} onClick={edit.undo} aria-label="ביטול" title="ביטול (Ctrl+Z)"><IconUndo /></button>
                <button type="button" class="btn btn-sm" disabled={!edit.canRedo} onClick={edit.redo} aria-label="חזרה" title="חזרה (Ctrl+Y)"><IconRedo /></button>
              </div>
            )}
            <div class="canvas-hint">
              {readOnly ? "האוטומט נעול במשימה הזו" : tool === "state" ? "לחצו במקום ריק כדי להוסיף מצב" : tool === "edge" ? "לחצו על מצב המקור ואחר כך על מצב היעד (אותו מצב = לולאה)" : "גררו מצב כדי להזיז · לחיצה כפולה במקום ריק מוסיפה מצב · לחיצה על חץ עורכת אותו"}
            </div>
          </div>
          {edge && !readOnly && <EdgePopover a={a} edge={edge} onClose={() => setEdge(null)}
            onChange={symbols => edit.set(x => setEdgeSymbols(x, edge.from, edge.to, symbols))} />}
        </section>

        <section class="card">
          <div class="tabs" role="tablist">
            <button type="button" role="tab" class={tab === "table" ? "on" : ""} onClick={() => setTab("table")}>טבלת מעברים</button>
            <button type="button" role="tab" class={tab === "triples" ? "on" : ""} onClick={() => setTab("triples")}>שלשות</button>
            <button type="button" role="tab" class={tab === "formal" ? "on" : ""} onClick={() => setTab("formal")}>הגדרה פורמלית</button>
            <div class="spacer" />
            {tab === "table" && <button type="button" class="btn btn-sm btn-ghost" onClick={() => {
              navigator.clipboard?.writeText(tableAsText(a)).then(() => toast("הטבלה הועתקה כטקסט"), () => toast("ההעתקה נכשלה", true));
            }}>העתקת הטבלה</button>}
          </div>
          {tab === "table" && <TransitionTable a={a} editable={!readOnly} errCells={errCells} onSetCell={(s, c, ts) => edit.set(x => setCell(x, s, c, ts))} />}
          {tab === "triples" && <Triples a={a} />}
          {tab === "formal" && <div style={{ padding: "12px 14px" }}><FormalDefinition a={a} /></div>}
        </section>
      </main>
    </div>
  );
}

function AlphabetField({ a, disabled, onChange }: { a: Automaton; disabled: boolean; onChange: (alpha: string[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = a.alphabet.join(", ");
  const commit = () => {
    if (text === null) return;
    const next = parseAlphabet(text);
    setText(null);
    if (next.join("\u0000") !== a.alphabet.join("\u0000")) onChange(next);
  };
  return (
    <label class="field">האלפבית Σ (סמלים מופרדים בפסיק)
      <input class="input mono" dir="ltr" style={{ textAlign: "left" }} disabled={disabled} value={text ?? shown}
        onInput={e => setText((e.target as HTMLInputElement).value)} onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} />
    </label>
  );
}

function EdgePopover({ a, edge, onChange, onClose }: { a: Automaton; edge: { from: string; to: string; x: number; y: number }; onChange: (s: string[]) => void; onClose: () => void }) {
  const on = new Set(a.transitions.filter(t => t.from === edge.from && t.to === edge.to).map(t => t.symbol));
  const label = (id: string) => a.states.find(s => s.id === id)?.label ?? id;
  const extra = [...on].filter(c => !a.alphabet.includes(c));
  const toggle = (c: string) => {
    const next = new Set(on);
    next.has(c) ? next.delete(c) : next.add(c);
    onChange([...next]);
  };
  return (
    <div class="pop" style={{ left: `${Math.min(Math.max(8, edge.x - 120), 9999)}px`, top: `${edge.y + 18}px` }}>
      <div class="between"><strong>{edge.from === edge.to ? `לולאה על ${label(edge.from)}` : `מעבר מ-${label(edge.from)} אל ${label(edge.to)}`}</strong>
        <button type="button" class="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button></div>
      <div class="small muted">באילו סמלים עוברים? (כמה סמלים = a,b על החץ)</div>
      <div class="symbol-checks">
        {a.alphabet.map(c => <button type="button" key={c} class={`chip${on.has(c) ? " on" : ""}`} aria-pressed={on.has(c)} onClick={() => toggle(c)}>{c}</button>)}
        {extra.map(c => <button type="button" key={c} class="chip on" style={{ borderColor: "#B93A2B", color: "#8A2A1F" }} title="הסמל אינו באלפבית" onClick={() => toggle(c)}>{c} ✕</button>)}
      </div>
      <div class="row">
        <button type="button" class="btn btn-sm btn-danger" disabled={on.size === 0} onClick={() => { onChange([]); onClose(); }}>מחיקת החץ</button>
        <button type="button" class="btn btn-sm btn-primary" onClick={onClose}>סיום</button>
      </div>
    </div>
  );
}
