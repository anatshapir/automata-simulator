import { useMemo, useState } from "preact/hooks";
import { type Automaton, Index, type TestWord, type ToolCode, type Word } from "../model/automaton.js";
import { acceptedUpTo, acceptsEpsilon, buildChecklist, checkWords, counts, deadStates, shortestAccepted, unreachableStates } from "../analysis/tools.js";
import { parseWord, showWord } from "../engine/word.js";

const TOOL_NAMES: Record<ToolCode, string> = {
  "T-1": "האם ε מתקבלת?",
  "T-2": "המילים הקצרות ביותר שמתקבלות",
  "T-3": "בדיקת רשימת מילים",
  "T-4": "מילים מתקבלות עד אורך n",
  "T-5": "מצבים שלא ניתנים להשגה",
  "T-6": "מצבים מתים",
  "T-7": "השלמה לאסד״מ",
  "T-8": "ספירת מצבים ומעברים",
  "T-9": "שלבי הבנייה",
};
export { TOOL_NAMES };

interface Props {
  a: Automaton;
  tools: ToolCode[];
  runnable: boolean;
  fromTask: boolean;
  tried: { accepted: boolean }[];
  onTry: (w: Word) => void;
  onComplete: () => void;
}

/** Tools T-1..T-9 (spec 7.1). In a task only the tools the teacher opened appear; in free work all of them. */
export function ToolsPanel(p: Props) {
  const [open, setOpen] = useState<ToolCode | null>(p.tools.includes("T-9") && p.fromTask ? "T-9" : null);
  const list = p.tools.filter(t => t !== "T-7" || p.a.type === "dfa-partial");
  if (list.length === 0) return null;
  return (
    <section class="card pad stack">
      <h2>{p.fromTask ? "כלים שהמורה פתחה במשימה הזו" : "כלי עזר"}</h2>
      {list.map(t => (
        <div key={t} class="stack" style={{ gap: "6px" }}>
          <button type="button" class="btn" style={{ justifyContent: "space-between" }} aria-expanded={open === t} onClick={() => setOpen(open === t ? null : t)}>
            <span>{TOOL_NAMES[t]}</span><span class="mono small muted">{t}</span>
          </button>
          {open === t && <ToolBody t={t} {...p} />}
        </div>
      ))}
      {p.fromTask && <div class="small muted">כלים אחרים סגורים במשימה הזו.</div>}
    </section>
  );
}

function needsRunnable(t: ToolCode) { return t !== "T-8" && t !== "T-9"; }

function ToolBody({ t, a, runnable, tried, onTry, onComplete }: Props & { t: ToolCode }) {
  const ix = new Index(a);
  const W = (w: Word) => <button type="button" class="chip" onClick={() => onTry(w)} title="להרצה">{showWord(w, a.alphabet)}</button>;
  if (needsRunnable(t) && !runnable) return <div class="tool-out">יש לתקן את השגיאות באוטומט לפני שמשתמשים בכלי הזה.</div>;
  switch (t) {
    case "T-1": {
      const yes = acceptsEpsilon(a);
      return <div class="tool-out">{yes ? "ε מתקבלת" : "ε נדחית"}, כי המצב ההתחלתי {ix.label(a.initialStateId!)} {yes ? "מקבל" : "אינו מקבל"}.</div>;
    }
    case "T-2": {
      const ws = shortestAccepted(a);
      return <div class="tool-out stack">{ws.length === 0 ? "האוטומט לא מקבל אף מילה (השפה ריקה)." : <>
        <span>אורך {ws[0]!.length}: {ws.length === 1 ? "מילה אחת" : `${ws.length} מילים`}</span>
        <div class="symbol-pad">{ws.map((w, i) => <span key={i}>{W(w)}</span>)}</div></>}</div>;
    }
    case "T-3": return <WordList a={a} onTry={onTry} />;
    case "T-4": return <UpTo a={a} onTry={onTry} />;
    case "T-5": {
      const u = unreachableStates(a);
      return <div class="tool-out">{u.length ? <>אי אפשר להגיע מהמצב ההתחלתי אל: <span class="mono">{u.map(id => ix.label(id)).join(", ")}</span></> : "אפשר להגיע לכל המצבים מהמצב ההתחלתי."}</div>;
    }
    case "T-6": {
      const d = deadStates(a);
      return <div class="tool-out">{d.length ? <>מצבים שמהם אי אפשר להגיע למצב מקבל: <span class="mono">{d.map(id => ix.label(id)).join(", ")}</span>. כל מלכודת היא מצב מת, אבל לא כל מצב מת הוא מלכודת.</> : "מכל מצב אפשר עוד להגיע למצב מקבל."}</div>;
    }
    case "T-7":
      return <div class="tool-out stack"><span>מה היינו מוסיפים אם הוא היה מלא? ההשלמה יוצרת עותק עם מצב מלכודת אחד, ומפנה אליו כל תא ריק. המקור נשמר בהיסטוריה (ביטול).</span>
        <button type="button" class="btn btn-sm" onClick={onComplete}>השלמה לאסד״מ (יוצר עותק)</button></div>;
    case "T-8": {
      const c = counts(a);
      return <div class="tool-out">{c.states} מצבים · {c.transitions} מעברים · {c.selfLoops} לולאות עצמיות <span class="muted">(חץ a,b נספר כשני מעברים)</span></div>;
    }
    case "T-9": {
      const items = buildChecklist(a, tried, runnable);
      return <div class="tool-out stack">{items.map(it => (
        <div class="check-item" key={it.id}><span class={`check-box${it.done ? " on" : ""}`} aria-hidden="true">{it.done ? "✓" : ""}</span>
          <span>{it.label}{it.detail && <span class="muted"> · <bdi>{it.detail}</bdi></span>}</span></div>))}</div>;
    }
  }
}

function WordList({ a, onTry }: { a: Automaton; onTry: (w: Word) => void }) {
  const [text, setText] = useState("");
  const lines = text.split("\n").map(l => l.trim()).filter(l => l !== "");
  const parsed = lines.map(l => {
    const m = /^([+-])\s*(.*)$/u.exec(l);
    const body = m ? m[2]! : l;
    const pw = parseWord(body === "ε" ? "" : body, a.alphabet);
    return { line: l, word: pw.word, issue: pw.issue, expected: m ? m[1] === "+" : undefined };
  });
  const checked = checkWords(a, parsed.filter(x => !x.issue).map(x => (x.expected === undefined ? { word: x.word } : { word: x.word, expected: x.expected })));
  let k = 0;
  return (
    <div class="tool-out stack">
      <textarea class="input mono" dir="ltr" style={{ textAlign: "left" }} rows={4} value={text} placeholder={"מילה בכל שורה\n+aab  (צריכה להתקבל)\n-ba   (צריכה להידחות)"}
        onInput={e => setText((e.target as HTMLTextAreaElement).value)} aria-label="מילים לבדיקה, אחת בכל שורה" />
      {parsed.map((x, i) => {
        if (x.issue) return <div key={i} class="small" style={{ color: "#8A2A1F" }}>{x.issue.message}</div>;
        const c = checked[k++]!;
        return (
          <div key={i} class={`tw${c.correct === false ? " bad" : ""}`}>
            {c.correct === null ? <span class="muted">·</span> : c.correct ? <span class="mark-ok">✓</span> : <span class="mark-bad">✕</span>}
            <button type="button" class="chip" onClick={() => onTry(c.word)}>{showWord(c.word, a.alphabet)}</button>
            <span class="small">{c.run.accepted ? "מתקבלת" : c.run.status === "stuck" ? "נתקעת" : "נדחית"}{c.message ? ` · ${c.message}` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function UpTo({ a, onTry }: { a: Automaton; onTry: (w: Word) => void }) {
  const [n, setN] = useState(4);
  const res = useMemo(() => acceptedUpTo(a, n), [a, n]);
  return (
    <div class="tool-out stack">
      <label class="row">עד אורך <input class="input" type="number" min={0} max={20} value={n} style={{ width: "80px" }} onInput={e => setN(Math.max(0, Math.min(20, Number((e.target as HTMLInputElement).value) || 0)))} /></label>
      <span>{res.words.length} מילים{res.truncated ? " · הרשימה נחתכה אחרי 200 מילים" : ""}</span>
      <div class="symbol-pad" style={{ maxHeight: "180px", overflow: "auto" }}>{res.words.map((w, i) => <span key={i}><button type="button" class="chip" onClick={() => onTry(w)}>{showWord(w, a.alphabet)}</button></span>)}</div>
    </div>
  );
}

/** Teacher's test words in a task (spec 7.2): run all with one click, ✓/✕ and a message per wrong word. */
export function TestWordsPanel({ a, words, runnable, onTry }: { a: Automaton; words: TestWord[]; runnable: boolean; onTry: (w: Word) => void }) {
  const [ran, setRan] = useState(false);
  const results = useMemo(() => (ran && runnable ? checkWords(a, words) : null), [ran, runnable, a, words]);
  const good = results?.filter(r => r.correct).length ?? 0;
  const firstBad = results?.find(r => !r.correct);
  return (
    <section class="card pad stack">
      <div class="between"><h2>מילות הבדיקה של המורה</h2>{results && <span class="small" style={{ fontWeight: 600, color: good === words.length ? "#1F7A4D" : "#8A2A1F" }}>{good} מתוך {words.length}</span>}</div>
      {!runnable && <div class="small muted">יש לתקן את השגיאות באוטומט כדי להריץ את מילות הבדיקה.</div>}
      <div>
        {words.map((w, i) => {
          const r = results?.[i];
          return (
            <div key={i} class={`tw${r && !r.correct ? " bad" : ""}`}>
              {r ? (r.correct ? <span class="mark-ok">✓</span> : <span class="mark-bad">✕</span>) : <span class="muted">·</span>}
              <span class="w">{showWord(w.word, a.alphabet)}</span>
              <span class="small muted" style={{ flex: 1 }}>צריכה {w.expected ? "להתקבל" : "להידחות"}{r ? ` · ${r.run.accepted ? "התקבלה" : "נדחתה"}` : ""}</span>
            </div>
          );
        })}
      </div>
      {firstBad?.message && <div class="issue error"><div><strong>{firstBad.message}</strong> הריצו אותה צעד אחר צעד ובדקו לאן האוטומט עובר.</div></div>}
      {results && good === words.length && <div class="ok-line">✓ כל מילות הבדיקה עברו</div>}
      <div class="row">
        <button type="button" class="btn btn-primary" disabled={!runnable} onClick={() => setRan(true)}>{ran ? "הרצה מחדש" : "הרצת כל המילים"}</button>
        {firstBad && <button type="button" class="btn" onClick={() => onTry(firstBad.word)}>הרצת {showWord(firstBad.word, a.alphabet)} צעד אחר צעד</button>}
      </div>
      <div class="small muted">המשוב מבוסס רק על המילים שהמורה בחרה. מעבר של כל המילים לא מוכיח שהאוטומט נכון.</div>
    </section>
  );
}
