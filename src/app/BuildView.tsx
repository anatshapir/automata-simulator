import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Automaton, type AutomatonType, TYPE_NAMES } from "../model/automaton.js";
import type { Issue } from "../validation/validate.js";
import { type CanvasTool, Graph } from "../editor/graph/Graph.js";
import { edgeKey } from "../editor/graph/geometry.js";
import { FormalDefinition, TransitionTable, Triples, tableAsText } from "../editor/transition-table/Table.js";
import { addState, autoLayout, deleteState, moveEdge, moveState, parseAlphabet, patchState, setAlphabet, setCell, setEdgeSymbols, setInitial, setType, toggleAccepting } from "../editor/ops.js";
import { IconRedo, IconUndo, LockIcon } from "./icons.js";
import type { Completion } from "../analysis/tools.js";

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
  /** what "completion to a full DFA" added, marked until the next edit (spec 4.1) */
  added?: Completion | null;
  onCloseAdded?: () => void;
}

export function BuildView({ edit, issues, readOnly, lockTypeAlphabet, svgRef, tools, toast, added, onCloseAdded }: Props) {
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

  const addedT = added ? a.transitions.filter(t => t.to === added.trapId) : [];
  const addedStates = useMemo(() => new Set(added ? [added.trapId] : []), [added]);
  const addedEdges = useMemo(() => new Set(addedT.map(t => edgeKey(t.from, t.to))), [added, a]);
  const addedCells = useMemo(() => new Set(addedT.map(t => `${t.from}\u0000${t.symbol}`)), [added, a]);
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const state = a.states.find(s => s.id === sel) ?? null;

  const removeState = (id: string) => {
    const st = a.states.find(s => s.id === id);
    if (!st) return;
    const warn = id === a.initialStateId ? " זה היה המצב ההתחלתי: סמנו מצב התחלתי אחר." : a.acceptingStateIds.includes(id) ? " זה היה מצב מקבל." : "";
    edit.set(x => deleteState(x, id));
    setSel(null);
    toast(`${st.label} נמחק יחד עם המעברים שלו.${warn} אפשר לבטל.`);
  };
  const removeEdge = (from: string, to: string) => {
    edit.set(x => setEdgeSymbols(x, from, to, []));
    setEdge(null);
    toast("החץ נמחק. אפשר לבטל.");
  };

  // Delete / Backspace removes what is selected; Esc clears the selection.
  // The handler reads the latest selection through a ref (effects run after paint, a key can come first).
  const latest = useRef({ sel, edge, removeState, removeEdge, readOnly });
  latest.current = { sel, edge, removeState, removeEdge, readOnly };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const L = latest.current;
      if (L.readOnly || (e.target instanceof HTMLElement && e.target.closest("input, textarea, select"))) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (L.edge) { e.preventDefault(); L.removeEdge(L.edge.from, L.edge.to); }
        else if (L.sel) { e.preventDefault(); L.removeState(L.sel); }
      } else if (e.key === "Escape") { setSel(null); setEdge(null); setTool("select"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  /** where a state sits on screen, relative to the canvas card */
  const screenOf = (x: number, y: number) => {
    const el = svgRef.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const pt = el.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(m);
    const r = el.getBoundingClientRect();
    return { x: q.x - r.left, y: q.y - r.top, w: r.width };
  };

  const onAddState = (x: number, y: number) => {
    const r = addState(a, x, y);
    edit.set(r.a);
    setSel(r.id);
    setTool("select");
  };

  return (
    <div class="workspace">
      <aside class="side">
        {added && (
          <section class="card pad stack added-card" aria-live="polite">
            <div class="between"><h2 style={{ color: "#1F7A4D" }}>נוצר עותק מלא · מה נוסף</h2>
              <button type="button" class="btn btn-sm btn-ghost" onClick={onCloseAdded} aria-label="סגירה">✕</button></div>
            <div>מצב מלכודת חדש <span class="mono ltr" style={{ fontWeight: 600 }}>{added.trapLabel}</span> עם לולאה על כל הסמלים, ו-{added.added.length} מעברים אליו מהתאים שהיו ריקים:</div>
            <div class="mono ltr" style={{ textAlign: "left", lineHeight: 1.9 }}>{added.added.map(([f, c, t], i) => <span key={i} style={{ marginInlineEnd: "14px", whiteSpace: "nowrap", display: "inline-block" }}>({f},{c},{t})</span>)}</div>
            <div class="small muted">מסומנים בירוק בציור ובטבלה. המקור לא השתנה: "ביטול" (Ctrl+Z) מחזיר אליו.</div>
          </section>
        )}
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
              highlight={{ errStates, errEdges, addedStates, addedEdges }}
              onMove={(id, x, y, done) => { edit.set(cur => moveState(cur, id, x, y), { coalesce: true }); if (done) edit.endCoalesce(); }}
              onSelectState={id => { setSel(id); setEdge(null); }}
              onStateDblClick={id => edit.set(x => toggleAccepting(x, id))}
              onAddState={onAddState}
              onAddEdge={(from, to, at) => { setEdge({ from, to, ...at }); setTool("select"); }}
              onSelectEdge={(from, to, at) => { setSel(null); setEdge({ from, to, ...at }); }} />
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
            <div class="canvas-hint" dir="rtl">
              {readOnly ? "האוטומט נעול במשימה הזו" : tool === "state" ? "לחצו במקום ריק כדי להוסיף מצב" : tool === "edge" ? "לחצו על מצב המקור ואחר כך על מצב היעד (אותו מצב = לולאה)" : sel ? "מקש Delete מוחק את המצב הנבחר · לחיצה כפולה על מצב הופכת אותו למקבל" : "לחיצה על מצב: מקבל, התחלתי, שם, מחיקה · לחיצה על חץ: סמלים ומחיקה · לחיצה כפולה במקום ריק: מצב חדש"}
            </div>
          </div>
          {state && !readOnly && tool === "select" && !edge && (() => {
            const at = screenOf(state.x, state.y);
            if (!at) return null;
            const acc = a.acceptingStateIds.includes(state.id);
            const isStart = a.initialStateId === state.id;
            return (
              <div class="state-bar" role="toolbar" aria-label={`פעולות על ${state.label}`}
                style={{ left: `${Math.max(8, Math.min(at.x - 200, at.w - 420))}px`, top: `${Math.max(8, at.y + 40)}px` }}>
                <LabelInput key={state.id} a={a} id={state.id} onRename={l => edit.set(x => patchState(x, state.id, { label: l }), { coalesce: true })} onDone={edit.endCoalesce} />
                <button type="button" class={`btn btn-sm${acc ? " on" : ""}`} aria-pressed={acc} onClick={() => edit.set(x => toggleAccepting(x, state.id))}
                  title="מצב מקבל (או לחיצה כפולה על המצב)">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
                  {acc ? "מקבל ✓" : "מקבל"}
                </button>
                <button type="button" class={`btn btn-sm${isStart ? " on" : ""}`} disabled={isStart} onClick={() => edit.set(x => setInitial(x, state.id))} title="מצב התחלתי">
                  → {isStart ? "התחלתי ✓" : "התחלתי"}
                </button>
                <button type="button" class="btn btn-sm btn-danger" onClick={() => removeState(state.id)} title="מחיקה (Delete)">🗑 מחיקה</button>
              </div>
            );
          })()}
          {edge && !readOnly && <EdgePopover a={a} edge={edge} onClose={() => setEdge(null)}
            onChange={symbols => edit.set(x => setEdgeSymbols(x, edge.from, edge.to, symbols))} onDelete={() => removeEdge(edge.from, edge.to)}
            onRedirect={(nf, nt) => { edit.set(x => moveEdge(x, edge.from, edge.to, nf, nt)); setEdge({ ...edge, from: nf, to: nt }); }} />}
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
          {tab === "table" && <TransitionTable a={a} editable={!readOnly} errCells={errCells} addedCells={addedCells} onSetCell={(s, c, ts) => edit.set(x => setCell(x, s, c, ts))} />}
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

function EdgePopover({ a, edge, onChange, onClose, onDelete, onRedirect }: { a: Automaton; edge: { from: string; to: string; x: number; y: number }; onChange: (s: string[]) => void; onClose: () => void; onDelete: () => void; onRedirect: (from: string, to: string) => void }) {
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
      {on.size > 0 && (
        <div class="row small" style={{ gap: "6px" }}>
          <label class="row" style={{ gap: "4px" }}>מ-
            <select class="input mono" style={{ width: "auto", minHeight: "34px", padding: "2px 6px" }} aria-label="מצב המקור" value={edge.from}
              onChange={e => onRedirect((e.target as HTMLSelectElement).value, edge.to)}>
              {a.states.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
          </label>
          <label class="row" style={{ gap: "4px" }}>אל
            <select class="input mono" style={{ width: "auto", minHeight: "34px", padding: "2px 6px" }} aria-label="מצב היעד" value={edge.to}
              onChange={e => onRedirect(edge.from, (e.target as HTMLSelectElement).value)}>
              {a.states.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
          </label>
        </div>
      )}
      <div class="small muted">באילו סמלים עוברים? (כמה סמלים = a,b על החץ)</div>
      <div class="symbol-checks">
        {a.alphabet.map(c => <button type="button" key={c} class={`chip${on.has(c) ? " on" : ""}`} aria-pressed={on.has(c)} onClick={() => toggle(c)}>{c}</button>)}
        {extra.map(c => <button type="button" key={c} class="chip on" style={{ borderColor: "#B93A2B", color: "#8A2A1F" }} title="הסמל אינו באלפבית" onClick={() => toggle(c)}>{c} ✕</button>)}
      </div>
      <div class="row">
        <button type="button" class="btn btn-sm btn-danger" disabled={on.size === 0} onClick={onDelete}>🗑 מחיקת החץ</button>
        <button type="button" class="btn btn-sm btn-primary" onClick={onClose}>סיום</button>
      </div>
    </div>
  );
}

/** State name: an empty or duplicate name is refused while typing (spec 3.2, AC-03); the old name stays. */
function LabelInput({ a, id, onRename, onDone }: { a: Automaton; id: string; onRename: (l: string) => void; onDone: () => void }) {
  const current = a.states.find(s => s.id === id)?.label ?? "";
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? current;
  const t = shown.trim();
  const problem = t === "" ? "לכל מצב צריך שם" : a.states.some(s => s.id !== id && s.label === t) ? `כבר יש מצב בשם ${t}` : null;
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <input class="input mono" aria-label="שם המצב" aria-invalid={!!problem} value={shown} dir="auto"
        style={{ width: "96px", minHeight: "34px", padding: "4px 8px", ...(problem ? { borderColor: "#B93A2B", background: "#FBE9E6" } : {}) }}
        onInput={e => {
          const v = (e.target as HTMLInputElement).value;
          setText(v);
          const vt = v.trim();
          if (vt !== "" && !a.states.some(s => s.id !== id && s.label === vt)) onRename(vt);
        }}
        onBlur={() => { setText(null); onDone(); }} />
      {problem && <span role="alert" class="name-problem">{problem}. השם הקודם נשמר.</span>}
    </span>
  );
}
