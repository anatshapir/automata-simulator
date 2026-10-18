import { useState } from "preact/hooks";
import { ALL_TOOLS, type Automaton, type AutomatonType, type Task, TASK_KIND_NAMES, type TaskKind, type TestWord, TYPE_NAMES } from "../model/automaton.js";
import { parseWord, showWord } from "../engine/word.js";
import { parseAlphabet, setAlphabet, setType } from "../editor/ops.js";
import { TOOL_NAMES } from "./ToolsPanel.js";

interface Props {
  a: Automaton;
  set: (f: (a: Automaton) => Automaton, o?: { coalesce?: boolean }) => void;
  endCoalesce: () => void;
  onPreview: () => void;
  onSave: () => void;
}

const defaultTask = (): Task => ({ prompt: "", kind: "build", tools: ["T-1", "T-2", "T-3", "T-9"], locked: false });

/** Teacher set-up (spec 7.2, screen 8). No accounts, no server: the task is saved inside the automaton file. */
export function TaskEditor({ a, set, endCoalesce, onPreview, onSave }: Props) {
  const task = a.task ?? defaultTask();
  const words = a.testWords ?? [];
  const put = (patch: Partial<Task>, o?: { coalesce?: boolean }) => set(x => ({ ...x, task: { ...(x.task ?? defaultTask()), ...patch } }), o);
  const putWords = (w: TestWord[]) => set(x => ({ ...x, testWords: w }));
  const [alpha, setAlpha] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const nw = parseWord(newWord, a.alphabet);

  return (
    <div class="workspace">
      <section class="card pad stack" style={{ flex: "1 1 520px" }}>
        <h2>1 · מה התלמיד צריך לעשות</h2>
        <label class="field">ניסוח המשימה
          <textarea class="input" rows={3} value={task.prompt} placeholder="למשל: בנו אסד״מ המקבל את כל המילים מעל {a,b} שמכילות את הרצף aa."
            onInput={e => put({ prompt: (e.target as HTMLTextAreaElement).value }, { coalesce: true })} onBlur={endCoalesce} />
        </label>
        <div class="stack"><span class="small" style={{ fontWeight: 500 }}>סוג המשימה</span>
          <div class="opt-grid">{(Object.keys(TASK_KIND_NAMES) as TaskKind[]).map(k => (
            <button type="button" key={k} class={`opt${task.kind === k ? " on" : ""}`} aria-pressed={task.kind === k} onClick={() => put({ kind: k })}>{TASK_KIND_NAMES[k]}</button>))}</div>
        </div>
        <div class="stack"><span class="small" style={{ fontWeight: 500 }}>סוג האוטומט</span>
          <div class="opt-grid">{(Object.keys(TYPE_NAMES) as AutomatonType[]).map(t => (
            <button type="button" key={t} class={`opt${a.type === t ? " on" : ""}`} aria-pressed={a.type === t} onClick={() => set(x => setType(x, t))}>{TYPE_NAMES[t]}</button>))}</div>
        </div>
        <label class="field">א״ב
          <input class="input mono" dir="ltr" style={{ textAlign: "left" }} value={alpha ?? a.alphabet.join(", ")} onInput={e => setAlpha((e.target as HTMLInputElement).value)}
            onBlur={() => { if (alpha !== null) { set(x => setAlphabet(x, parseAlphabet(alpha))); setAlpha(null); } }} />
        </label>
        <label class="row" style={{ padding: "10px 12px", background: "#F4F6F9", borderRadius: "10px", cursor: "pointer" }}>
          <input type="checkbox" checked={task.locked} onChange={e => put({ locked: (e.target as HTMLInputElement).checked })} style={{ width: "20px", height: "20px" }} />
          <span><strong>נעילת האוטומט לעריכה</strong> (למשימות מעקב ו"מאוטומט לשפה")<br />
            <span class="small muted">סוג וא״ב תמיד נעולים אצל התלמיד כשיש משימה. זו נעילת ממשק בלבד: תלמיד שעורך את הקובץ ידנית יכול לעקוף אותה.</span></span>
        </label>

        <h2 style={{ marginTop: "8px" }}>2 · מילות בדיקה</h2>
        <div class="small muted">התלמיד מריץ אותן בלחיצה ורואה לכל מילה שהאוטומט שלו טועה בה הודעה כמו "האוטומט שלך מקבל את aab, אבל היא לא בשפה".</div>
        {words.map((w, i) => (
          <div class="tw-edit" key={i}>
            <span class="input mono" dir="ltr" style={{ textAlign: "left", display: "flex", alignItems: "center" }}>{showWord(w.word, a.alphabet)}</span>
            <div class="pill" role="group" aria-label="התוצאה הנכונה">
              <button type="button" class={w.expected ? "yes" : ""} onClick={() => putWords(words.map((x, j) => j === i ? { ...x, expected: true } : x))}>מתקבלת</button>
              <button type="button" class={!w.expected ? "no" : ""} onClick={() => putWords(words.map((x, j) => j === i ? { ...x, expected: false } : x))}>נדחית</button>
            </div>
            <button type="button" class="btn btn-sm" aria-label="מחיקה" onClick={() => putWords(words.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div class="tw-edit">
          <input class="input mono" dir="ltr" style={{ textAlign: "left" }} placeholder="מילה חדשה (ריק = ε)" value={newWord} onInput={e => setNewWord((e.target as HTMLInputElement).value)} />
          <button type="button" class="btn btn-sm" disabled={!!nw.issue} onClick={() => { putWords([...words, { word: nw.word, expected: true }]); setNewWord(""); }}>+ מתקבלת</button>
          <button type="button" class="btn btn-sm" disabled={!!nw.issue} onClick={() => { putWords([...words, { word: nw.word, expected: false }]); setNewWord(""); }}>+ נדחית</button>
        </div>
        {nw.issue && <div class="small" style={{ color: "#8A2A1F" }}>{nw.issue.message}</div>}
      </section>

      <aside class="side" style={{ flexBasis: "400px" }}>
        <section class="card pad stack">
          <h2>3 · כלים פתוחים לתלמיד</h2>
          {ALL_TOOLS.map(t => (
            <label class="check-item" key={t} style={{ cursor: "pointer", fontSize: "15px" }}>
              <input type="checkbox" checked={task.tools.includes(t)} style={{ width: "18px", height: "18px" }}
                onChange={e => put({ tools: (e.target as HTMLInputElement).checked ? ALL_TOOLS.filter(x => x === t || task.tools.includes(x)) : task.tools.filter(x => x !== t) })} />
              <span>{TOOL_NAMES[t]} <span class="mono small muted">{t}</span></span>
            </label>
          ))}
          <div class="small muted">כלי שכבוי לא מופיע אצל התלמיד בכלל.</div>
        </section>
        <section class="card pad stack" style={{ background: "#FFF8EC", borderColor: "#F3D3A6" }}>
          <h2 style={{ color: "#6E3A03" }}>בדיקה מול הפתרון שלך</h2>
          <div class="small" style={{ color: "#5A3A10" }}>בגרסה הבאה (1.1). עד אז המשוב לתלמיד מבוסס על מילות הבדיקה בלבד, ופתרון לא נשמר בקובץ המשימה.</div>
        </section>
        <section class="card pad stack">
          <div class="small muted">האוטומט שנמצא עכשיו בעורך יישמר עם המשימה. במשימת בנייה השאירו אותו ריק או חלקי; במשימת מעקב שמרו אוטומט מלא ונעלו אותו.</div>
          <div class="row">
            <button type="button" class="btn" onClick={onPreview}>תצוגה כתלמיד</button>
            <button type="button" class="btn btn-primary" onClick={onSave}>שמירת קובץ משימה</button>
          </div>
          {a.task && <button type="button" class="btn btn-sm btn-danger" onClick={() => set(x => { const { task: _t, testWords: _w, ...rest } = x; return rest as Automaton; })}>הסרת המשימה מהקובץ</button>}
        </section>
      </aside>
    </div>
  );
}
