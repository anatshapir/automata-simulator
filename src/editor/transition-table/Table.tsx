import { useState } from "preact/hooks";
import { type Automaton, Index } from "../../model/automaton.js";
import { trapLikeStates } from "../../validation/validate.js";

interface Props {
  a: Automaton;
  editable: boolean;
  onSetCell?: (stateId: string, symbol: string, targets: string[]) => void;
  activeCells?: Set<string>; // "stateId\u0000symbol"
  errCells?: Set<string>;
}

const k = (s: string, c: string) => `${s}\u0000${c}`;

/** δ table: a row per state, a column per symbol; → start, * accepting (spec 2.3). */
export function TransitionTable(p: Props) {
  const ix = new Index(p.a);
  const traps = new Set(trapLikeStates(p.a));
  const det = p.a.type !== "nfa";
  return (
    <div class="tbl-wrap">
      <table class="delta">
        <thead>
          <tr><th>δ</th>{p.a.alphabet.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {p.a.states.map(s => {
            const mark = `${s.id === p.a.initialStateId ? "→" : ""}${ix.accepting.has(s.id) ? "*" : ""}`;
            return (
              <tr key={s.id} class={traps.has(s.id) ? "trap" : ""}>
                <th class="rowh">{mark ? `${mark} ` : ""}{s.label}</th>
                {p.a.alphabet.map(c => {
                  const targets = ix.targets(s.id, c);
                  const cls = [p.activeCells?.has(k(s.id, c)) && "active", p.errCells?.has(k(s.id, c)) && "err"].filter(Boolean).join(" ");
                  return (
                    <td key={c} class={cls}>
                      {!p.editable ? (targets.length ? targets.map(t => ix.label(t)).join(",") : "–")
                        : det && targets.length <= 1 ? (
                          <select aria-label={`δ(${s.label}, ${c})`} value={targets[0] ?? ""}
                            onChange={e => p.onSetCell?.(s.id, c, (e.target as HTMLSelectElement).value ? [(e.target as HTMLSelectElement).value] : [])}>
                            <option value="">–</option>
                            {p.a.states.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        ) : (
                          <MultiCell a={p.a} value={targets} label={`δ(${s.label}, ${c})`} onChange={ts => p.onSetCell?.(s.id, c, ts)} />
                        )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** NFA cell (or a deterministic cell that currently has several targets): "q1,q2". */
function MultiCell({ a, value, onChange, label }: { a: Automaton; value: string[]; onChange: (ids: string[]) => void; label: string }) {
  const ix = new Index(a);
  const shown = value.map(id => ix.label(id)).join(",");
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (text === null) return;
    const names = text.split(/[,\s]+/u).map(x => x.trim()).filter(Boolean);
    const ids: string[] = [];
    for (const n of names) {
      const s = a.states.find(s => s.label === n);
      if (!s) { setBad(true); return; }
      if (!ids.includes(s.id)) ids.push(s.id);
    }
    setBad(false);
    setText(null);
    onChange(ids);
  };
  return (
    <input aria-label={label} value={text ?? shown} placeholder="–" style={bad ? { borderColor: "#B93A2B" } : undefined}
      title={bad ? "אחד השמות אינו מצב באוטומט" : "שמות מצבים מופרדים בפסיק"}
      onInput={e => setText((e.target as HTMLInputElement).value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(null); setBad(false); } }} />
  );
}

export function Triples({ a }: { a: Automaton }) {
  const ix = new Index(a);
  if (a.transitions.length === 0) return <div class="triples muted">אין מעברים עדיין.</div>;
  return (
    <div class="triples">
      {a.transitions.map(t => <span key={t.id} style={{ marginInlineEnd: "18px", whiteSpace: "nowrap", display: "inline-block" }}>({ix.label(t.from)},{t.symbol},{ix.label(t.to)})</span>)}
    </div>
  );
}

export function FormalDefinition({ a }: { a: Automaton }) {
  const ix = new Index(a);
  const set = (xs: string[]) => `{${xs.join(", ")}}`;
  return (
    <div class="formal">
      <div>M = (Q, Σ, δ, q₀, F)</div>
      <div>Q = {set(a.states.map(s => s.label))}</div>
      <div>Σ = {set(a.alphabet)}</div>
      <div>q₀ = {a.initialStateId ? ix.label(a.initialStateId) : "?"}</div>
      <div>F = {set(a.acceptingStateIds.map(id => ix.label(id)))}</div>
    </div>
  );
}

/** Plain-text table for worksheets (nice-to-have, spec 9). Tab-separated, pastes into Word/Sheets. */
export function tableAsText(a: Automaton): string {
  const ix = new Index(a);
  const rows = [["δ", ...a.alphabet].join("\t")];
  for (const s of a.states) {
    const mark = `${s.id === a.initialStateId ? "→" : ""}${ix.accepting.has(s.id) ? "*" : ""}`;
    rows.push([`${mark}${s.label}`, ...a.alphabet.map(c => ix.targets(s.id, c).map(t => ix.label(t)).join(",") || "–")].join("\t"));
  }
  return rows.join("\n");
}
