import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ALL_TOOLS, type Automaton, emptyAutomaton, TASK_KIND_NAMES, TYPE_NAMES, type Word } from "../model/automaton.js";
import { errorsOf, validate } from "../validation/validate.js";
import { completeToFull } from "../analysis/tools.js";
import { FILE_EXTENSION, parseAutomatonFile, serializeAutomaton } from "../export/file.js";
import { deleteDraft, type Draft, loadDraft, saveDraft } from "../export/draft.js";
import { download, exportPng, exportSvg, safeName } from "../export/image.js";
import { formatSet } from "../engine/word.js";
import { useHistory } from "./history.js";
import { useRunner } from "./runner.js";
import { BuildView } from "./BuildView.js";
import { RunView } from "./RunView.js";
import { TaskEditor } from "./TaskEditor.js";
import { Present } from "./Present.js";
import { TestWordsPanel, ToolsPanel } from "./ToolsPanel.js";
import { EXAMPLES } from "./examples.js";
import { LockIcon, Logo } from "./icons.js";

type View = "build" | "run" | "task";
type Ask = { title: string; body: string; yes: string; onYes: () => void; no?: string; onNo?: () => void } | null;

export function App() {
  const [draft] = useState<Draft | null>(() => loadDraft());
  const [decided, setDecided] = useState(draft === null);
  const hist = useHistory<Automaton>(() => emptyAutomaton());
  const a = hist.value;
  const [view, setView] = useState<View>("build");
  const [teacher, setTeacher] = useState(false);
  const [present, setPresent] = useState(false);
  const [examples, setExamples] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [toastMsg, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const [tried, setTried] = useState<{ accepted: boolean }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const issues = useMemo(() => validate(a), [a]);
  const errors = errorsOf(issues);
  const runnable = errors.length === 0;
  const rn = useRunner(a, runnable);

  const toast = useCallback((text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(t => (t?.text === text ? null : t)), 4200);
  }, []);

  // autosave after every change, once the restore question was answered
  useEffect(() => {
    if (!decided) return;
    const pristine = !a.title && a.states.length <= 1 && a.transitions.length === 0 && !a.task;
    if (pristine) deleteDraft(); else saveDraft(a); // an untouched blank automaton is not worth offering back
  }, [a, decided]);
  // also save when the tab is closed or reloaded right after an edit (effects run after paint)
  const latestA = useRef({ a, decided });
  latestA.current = { a, decided };
  useEffect(() => {
    const flush = () => {
      const { a: cur, decided: ok } = latestA.current;
      if (ok && (cur.title || cur.states.length > 1 || cur.transitions.length || cur.task)) saveDraft(cur);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const task = a.task;
  const student = !!task && !teacher;
  const tools = student ? task!.tools : ALL_TOOLS;
  if (view === "run" && !runnable) setTimeout(() => setView("build"));
  if (view === "task" && !teacher) setTimeout(() => setView("build"));

  // record finished runs for the build checklist (T-9)
  useEffect(() => { if (view === "run" && rn.done && rn.run) setTried(t => [...t.slice(-30), { accepted: rn.run!.accepted }]); }, [rn.done, rn.run, view]);

  // keyboard: step forward/back/reset in run mode; undo/redo while building (spec 8: basic shortcuts only)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : document.body;
      const typing = el.closest("input, textarea, select, [contenteditable]");
      if ((view === "run" || present) && !typing) {
        if (e.key === "ArrowRight") { e.preventDefault(); rn.forward(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); rn.back(); }
        else if (e.key === "Home") { e.preventDefault(); rn.reset(); }
        else if (e.key === " " && !el.closest("button")) { e.preventDefault(); rn.toggle(); }
      }
      if (view === "build" && !typing && (e.ctrlKey || e.metaKey)) {
        // e.code, not e.key: with a Hebrew keyboard layout Ctrl+Z arrives as "ז"
        if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); hist.undo(); }
        else if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) { e.preventDefault(); hist.redo(); }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [view, present, rn, hist]);

  const replace = (next: Automaton, why: string) => {
    const go = () => { hist.set(next, { reset: true }); setView("build"); setTried([]); };
    const pristine = !hist.canUndo && a.states.length <= 1 && a.transitions.length === 0;
    if (pristine) go();
    else setAsk({ title: "להחליף את האוטומט הפתוח?", body: `${why} האוטומט שפתוח עכשיו יוחלף. אם צריך אותו, שמרו אותו קודם לקובץ.`, yes: "החלפה", onYes: go });
  };

  const openFile = async (f: File) => {
    const r = parseAutomatonFile(await f.text());
    if (!r.ok) { toast(r.message, true); return; }
    replace(r.automaton, `פתיחת ${f.name}.`);
    setTeacher(false);
  };

  const saveFile = () => {
    download(`${safeName(a.title)}${FILE_EXTENSION}`, new Blob([serializeAutomaton(a)], { type: "application/json" }));
    if (errors.length) toast(`נשמר עם ${errors.length} שגיאות. הן יסומנו שוב כשתפתחו את הקובץ.`);
  };

  const exportImage = (kind: "svg" | "png") => {
    const svg = svgRef.current;
    if (!svg) { toast("אין ציור לייצוא", true); return; }
    kind === "svg" ? exportSvg(svg, safeName(a.title)) : exportPng(svg, safeName(a.title)).catch(() => toast("הייצוא ל-PNG נכשל", true));
  };

  const tryWord = (w: Word) => {
    if (!runnable) { toast("יש לתקן את השגיאות לפני הרצה", true); return; }
    rn.setWord(w);
    setView("run");
  };

  const complete = () => {
    const c = completeToFull(a);
    hist.set(c.automaton);
    toast(`נוצר עותק מלא: נוסף מצב המלכודת ${c.trapLabel} ו-${c.added.length} מעברים אליו. "ביטול" מחזיר למקור.`);
  };

  const toolsPanel = (
    <>
      {student && a.testWords && a.testWords.length > 0 && <TestWordsPanel a={a} words={a.testWords} runnable={runnable} onTry={tryWord} />}
      <ToolsPanel key={`${student}`} a={a} tools={tools} runnable={runnable} fromTask={student} tried={tried} onTry={tryWord} onComplete={complete} />
    </>
  );

  return (
    <div class="app">
      <header class="top">
        <div class="brand">
          <Logo />
          <div>
            <div class="name">סימולטור אוטומטים</div>
            {student || view === "run" ? <div class="sub">{a.title || "ללא שם"} · {TYPE_NAMES[a.type]}</div> : (
              <input class="title-input" value={a.title ?? ""} placeholder="שם האוטומט (למשל: מילים שמכילות aa)" aria-label="שם האוטומט"
                onInput={e => hist.set(x => ({ ...x, title: (e.target as HTMLInputElement).value }), { coalesce: true })} onBlur={hist.endCoalesce} />
            )}
          </div>
        </div>
        <div class="seg" role="group" aria-label="מצב עבודה">
          <button type="button" class={view === "build" ? "on" : ""} onClick={() => setView("build")}>בנייה</button>
          <button type="button" class={view === "run" ? "on" : ""} disabled={!runnable} onClick={() => setView("run")} title={runnable ? "הרצת מילה" : `יש לתקן ${errors.length} שגיאות לפני הרצה`}>הרצה</button>
          {teacher && <button type="button" class={view === "task" ? "on" : ""} onClick={() => setView("task")}>הכנת משימה</button>}
        </div>
        {!runnable && <span class="small" style={{ color: "#B93A2B", fontWeight: 500 }}>יש לתקן {errors.length} שגיאות לפני הרצה</span>}
        <div class="spacer" />
        <div class="row">
          <button type="button" class="btn btn-sm" onClick={() => replace(emptyAutomaton(), "אוטומט חדש.")}>חדש</button>
          <button type="button" class="btn btn-sm" onClick={() => fileInput.current?.click()}>פתיחה</button>
          <button type="button" class="btn btn-sm" onClick={() => setExamples(true)}>דוגמאות</button>
          <button type="button" class="btn btn-sm" onClick={saveFile}>שמירה לקובץ</button>
          <details class="menu" style={{ position: "relative" }}>
            <summary class="btn btn-sm" style={{ listStyle: "none" }}>ייצוא ציור</summary>
            <div class="pop" style={{ top: "40px", left: 0, minWidth: "160px" }}>
              <button type="button" class="btn btn-sm" onClick={e => { (e.currentTarget as HTMLElement).closest("details")!.open = false; exportImage("svg"); }}>SVG</button>
              <button type="button" class="btn btn-sm" onClick={e => { (e.currentTarget as HTMLElement).closest("details")!.open = false; exportImage("png"); }}>PNG</button>
            </div>
          </details>
          <button type="button" class={`btn btn-sm${teacher ? " btn-primary" : ""}`} aria-pressed={teacher} onClick={() => { setTeacher(t => !t); if (!teacher) setView("task"); }}>
            {teacher ? "יציאה ממצב מורה" : "מצב מורה"}
          </button>
          <button type="button" class="btn btn-primary" onClick={() => setPresent(true)}>מצב הצגה</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" class="hidden" onChange={e => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) openFile(f);
          (e.target as HTMLInputElement).value = "";
        }} />
      </header>

      {student && view !== "task" && (
        <section class="banner" aria-label="המשימה">
          <div style={{ flex: "1 1 520px" }}>
            <div class="what">המשימה · {TASK_KIND_NAMES[task!.kind]}</div>
            <div class="prompt">{task!.prompt || "(המורה לא כתבה ניסוח)"}</div>
          </div>
          <div class="row">
            <span class="lock"><LockIcon />סוג: {TYPE_NAMES[a.type]}</span>
            <span class="lock"><LockIcon />א״ב: <span class="mono ltr">{formatSet(a.alphabet)}</span></span>
            {task!.locked && <span class="lock"><LockIcon />האוטומט נעול לעריכה</span>}
          </div>
        </section>
      )}

      {view === "build" && (
        <BuildView edit={{ a, set: hist.set, endCoalesce: hist.endCoalesce, undo: hist.undo, redo: hist.redo, canUndo: hist.canUndo, canRedo: hist.canRedo }}
          issues={issues} readOnly={student && !!task!.locked} lockTypeAlphabet={student} svgRef={svgRef} tools={toolsPanel} toast={toast} />
      )}
      {view === "run" && runnable && <RunView a={a} rn={rn} svgRef={svgRef} side={toolsPanel} />}
      {view === "task" && teacher && (
        <TaskEditor a={a} set={hist.set} endCoalesce={hist.endCoalesce} onSave={saveFile}
          onPreview={() => { if (!a.task) hist.set(x => ({ ...x, task: { prompt: "", kind: "build", tools: ["T-1", "T-2", "T-3", "T-9"], locked: false } })); setTeacher(false); setView("build"); }} />
      )}

      {present && <Present a={a} rn={rn} running={view === "run"} onExit={() => setPresent(false)} />}

      {!decided && draft && (
        <div class="overlay">
          <div class="dialog" role="dialog" aria-labelledby="dr-t">
            <h3 id="dr-t">נמצאה טיוטה שלא נשמרה לקובץ</h3>
            <div>"{draft.automaton.title || "ללא שם"}", {TYPE_NAMES[draft.automaton.type]}, {draft.automaton.states.length} מצבים · נשמרה {new Date(draft.savedAt).toLocaleString("he-IL")}</div>
            <div class="small muted">הטיוטה שמורה רק בדפדפן הזה ובמחשב הזה. היא לא מחליפה שמירה לקובץ.</div>
            <div class="row">
              <button type="button" class="btn btn-primary" onClick={() => { hist.set(draft.automaton, { reset: true }); setDecided(true); }}>שחזור הטיוטה</button>
              <button type="button" class="btn" onClick={() => { deleteDraft(); setDecided(true); }}>התחלה מחדש (מחיקת הטיוטה)</button>
            </div>
          </div>
        </div>
      )}

      {examples && (
        <div class="overlay" onClick={e => e.target === e.currentTarget && setExamples(false)}>
          <div class="dialog" role="dialog" aria-labelledby="ex-t" style={{ maxWidth: "640px" }}>
            <div class="between"><h3 id="ex-t">דוגמאות מהחומרים</h3><button type="button" class="btn btn-sm btn-ghost" onClick={() => setExamples(false)} aria-label="סגירה">✕</button></div>
            <div class="small muted">כל הדוגמאות נבדקו מול החומרים ומול הגדרת השפה.</div>
            <div class="examples">
              {EXAMPLES.map(ex => (
                <button type="button" key={ex.id} onClick={() => { setExamples(false); replace(structuredClone(ex.automaton), `פתיחת הדוגמה "${ex.title}".`); }}>
                  <span>{ex.title}{ex.defect && <span style={{ color: "#B93A2B" }}> · שגיאה במקור (להדגמה)</span>}</span>
                  <span class="small muted">{ex.where}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {ask && (
        <div class="overlay">
          <div class="dialog" role="alertdialog" aria-labelledby="ask-t">
            <h3 id="ask-t">{ask.title}</h3>
            <div>{ask.body}</div>
            <div class="row">
              <button type="button" class="btn btn-primary" onClick={() => { ask.onYes(); setAsk(null); }}>{ask.yes}</button>
              <button type="button" class="btn" onClick={() => { ask.onNo?.(); setAsk(null); }}>{ask.no ?? "ביטול"}</button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && <div class={`toast${toastMsg.err ? " err" : ""}`} role="status">{toastMsg.text}</div>}
    </div>
  );
}
