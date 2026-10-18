"""
Acceptance report (spec 11.1, AC-36): runs the official tests and the browser checks, maps every
acceptance criterion to its evidence, and writes docs/acceptance-report.md with command, output and date.

    python3 tools/acceptance_report.py

Needs Node (npm install done) and Python with Playwright + Chromium.
"""
import datetime, json, os, re, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "acceptance-report.md")
PORT = 4199

# AC -> (short text, [evidence]); evidence: ("unit", "substring", ...) all substrings in the test's full name,
# or ("ui", "prefix of a browser check line")
ACS = {
    "AC-01": ("מצב התחלתי אחד בדיוק; בלי מצב התחלתי F-02", [("unit", "F-02-no-start"), ("ui", "AC-01")]),
    "AC-02": ("גרף, טבלה ושלשות הם מודל אחד", [("ui", "AC-02")]),
    "AC-03": ("שינוי שם לא מנתק מעברים; שם כפול נדחה", [("unit", "renaming a state"), ("unit", "unique-labels"), ("ui", "AC-03")]),
    "AC-04": ("F-03 / F-04 חוסמים הרצה ומציינים מצב וסמל", [("unit", "F-03-missing-transition"), ("unit", "F-04-two-targets-dfa")]),
    "AC-05": ("כל אסד״מ ב-fixtures תקין; מעבר זהה נשמר פעם אחת", [("unit", "loads and has no validation errors"), ("unit", "F-04-not-for-identical")]),
    "AC-06": ("אס״ד לא מלא נתקע ומציג יתרת קלט", [("unit", "partial DFA stuck"), ("unit", "partial-starts-with-ab", "matches every expected run")]),
    "AC-07": ("השלמה לאסד״מ: עותק, מלכודת אחת, סימון מה נוסף", [("unit", "T-7 completes"), ("unit", "AC-07"), ("ui", "AC-07")]),
    "AC-08": ("א״ס: אפס, אחד או כמה יעדים", [("unit", "nfa-slide29", "matches every expected run"), ("unit", "synthetic-set-merge", "matches every expected run")]),
    "AC-09": ("קבלה בא״ס, קבוצות ומסלול מקבל (שקף 33)", [("unit", "nfa-slide33.json", "matches every expected run")]),
    "AC-10": ("כשכל המסלולים נכשלים: דחייה ויתרת קלט", [("unit", "NFA: F-15 when some paths fail"), ("unit", "synthetic-tree-stuck-branches", "matches every expected run")]),
    "AC-11": ("אין הכרעה לפני סוף הקלט", [("unit", "decides only after the last symbol")]),
    "AC-12": ("ε לפי המצב ההתחלתי, בלי צעדים", [("unit", "AC-12")]),
    "AC-13": ("צעד אחורה משחזר במדויק", [("ui", "AC-13")]),
    "AC-14": ("סמל שאינו ב-Σ: F-11 עם מיקום (0312)", [("unit", "input cases (F-11)"), ("unit", "unknown symbol: F-11")]),
    "AC-15": ("לולאה ומלכודת לא עוצרות", [("unit", "trap is an ordinary state")]),
    "AC-16": ("שמירה וטעינה משחזרות הכול כולל משימה", [("unit", "AC-16"), ("unit", "loads and has no validation errors")]),
    "AC-17": ("קובץ פגום / גרסה לא נתמכת נדחים", [("unit", "broken file is rejected"), ("unit", "unsupported schema version"), ("ui", "AC-17")]),
    "AC-18": ("מחיקת מצב: מעברים, אזהרה, ביטול", [("ui", "AC-18")]),
    "AC-19": ("שינוי אלפבית מסמן F-05 ולא מוחק", [("unit", "AC-19")]),
    "AC-20": ("כל מקרי התקינות מדויקים; הודעות בעברית", [("unit", "produces exactly the expected errors"), ("unit", "every message is Hebrew text")]),
    "AC-21": ("מצב בלי מקרא: אזהרה F-09", [("unit", "F-09-missing-memory")]),
    "AC-22": ("T-2: כל המילים באורך המינימלי (12, 13, 14, 8, 9)", [("unit", "AC-22")]),
    "AC-23": ("כל ערכי expected בכל ה-fixtures משתחזרים", [("unit", "matches every expected run"), ("unit", "matches the analysis tools")]),
    "AC-24": ("אוטומט לא תקין נשמר עם אזהרה ונטען עם אותן שגיאות", [("unit", "an invalid automaton saves and reloads"), ("ui", "AC-24")]),
    "AC-25": ("SVG ו-PNG שומרים סימונים", [("ui", "AC-25")]),
    "AC-26": ("קריאות: 14px, 4.5:1, 150%, סרט החרוזים LTR", [("ui", "AC-26")]),
    "AC-27": ("סמל מרובה-תווים; [ab] מול [a,b]", [("unit", "AC-27")]),
    "AC-28": ("סמל ריק, רווח, פסיק, כפול או ε נדחה", [("unit", "F-01-epsilon-symbol"), ("unit", "F-06-symbol-with-comma"), ("unit", "F-06-symbol-with-space")]),
    "AC-29": ("משימה: כלים שנבחרו, נעילה, עבודה חופשית", [("ui", "AC-29")]),
    "AC-30": ("מלכודות לפי ההגדרה (q4, q9); מצב מת רק ב-T-6", [("unit", "AC-30")]),
    "AC-31": ("עץ חישוב: כלל 16 העלים במקרי הקצה", [("unit", "synthetic-tree-limit", "matches every expected run"), ("unit", "synthetic-tree-stuck-branches", "matches every expected run"), ("unit", "tree: hidden message")]),
    "AC-32": ("טיוטה: שחזור, מחיקה, בלי דריסה שקטה", [("ui", "AC-32")]),
    "AC-33": ("בהרצה העריכה נעולה; שינוי מילה מבטל; Undo/Redo", [("ui", "AC-33"), ("ui", "A second word"), ("ui", "Ctrl+Z")]),
    "AC-34": ("שינוי סוג מציג הפרות וחזרה משחזרת", [("unit", "AC-34"), ("unit", "changing the type")]),
    "AC-35": ("T-4: הודעת חיתוך מעל 200", [("unit", "AC-35"), ("unit", "T-4 caps at 200")]),
    "AC-36": ("כל תנאי קבלה מתועד עם פקודה, פלט ותאריך", [("meta",)]),
    "AC-37": ("מילות בדיקה: טעויות מוסברות, נכונות מסומנות", [("unit", "T-3 explains"), ("ui", "AC-37")]),
    "AC-38": ("מצב הצגה: בלי לוח צד, 28px ומעלה, יציאה", [("ui", "AC-38")]),
}

def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kw)

def main():
    now = datetime.datetime.now().astimezone()
    commit = run(["git", "rev-parse", "--short", "HEAD"]).stdout.strip()
    dirty = bool(run(["git", "status", "--porcelain", "--", "src", "tests"]).stdout.strip())

    tc = run(["npx", "tsc", "--noEmit"])
    vt = run(["npx", "vitest", "run", "--reporter=json", "--outputFile=/tmp/vitest-report.json"])
    data = json.load(open("/tmp/vitest-report.json"))
    unit = []
    for f in data["testResults"]:
        for t in f["assertionResults"]:
            unit.append((t["fullName"], t["status"] == "passed"))

    build = run(["npx", "vite", "build"])
    server = subprocess.Popen(["npx", "vite", "preview", "--port", str(PORT), "--strictPort"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/"); break
            except Exception: time.sleep(0.5)
        ui = run([sys.executable, "tests/ui/ui_acceptance.py", f"http://127.0.0.1:{PORT}/"], timeout=900)
    finally:
        server.terminate()
    ui_lines = [l for l in ui.stdout.splitlines() if l.startswith(("PASS ", "FAIL "))]

    rows, all_ok = [], True
    for ac, (text, evidence) in ACS.items():
        found, ok = [], True
        for ev in evidence:
            if ev[0] == "meta":
                found.append("הדוח הזה"); continue
            if ev[0] == "unit":
                hits = [(n, p) for n, p in unit if all(s in n for s in ev[1:])]
                if not hits: ok = False; found.append(f"חסר: {' / '.join(ev[1:])}"); continue
                ok &= all(p for _, p in hits)
                found.append(f"vitest: {' / '.join(ev[1:])} ({sum(p for _, p in hits)}/{len(hits)})")
            else:
                hits = [l for l in ui_lines if l[5:].startswith(ev[1])]
                if not hits: ok = False; found.append(f"חסר: דפדפן {ev[1]}"); continue
                ok &= all(l.startswith("PASS") for l in hits)
                found.append(f"דפדפן: {ev[1]} ({sum(l.startswith('PASS') for l in hits)}/{len(hits)})")
        all_ok &= ok
        rows.append((ac, text, "; ".join(found), "עובר" if ok else "**נכשל**"))

    unit_pass = sum(p for _, p in unit)
    ui_pass = sum(l.startswith("PASS") for l in ui_lines)
    md = [
        "# דוח קבלה · סימולטור אוטומטים, גרסה 1", "",
        f"- **תאריך:** {now:%Y-%m-%d %H:%M} ({now.tzname()})",
        f"- **גרסת קוד:** `{commit}`" + (" (עם שינויים שלא נשמרו)" if dirty else ""),
        f"- **סיכום:** {'כל 38 תנאי הקבלה עוברים' if all_ok else 'יש תנאים שנכשלו'}", "",
        "## הפקודות והפלט", "",
        "| פקודה | תוצאה |", "|---|---|",
        f"| `npx tsc --noEmit` | {'עבר' if tc.returncode == 0 else 'נכשל'} |",
        f"| `npx vitest run` | {unit_pass}/{len(unit)} בדיקות עברו |",
        f"| `npx vite build` | {'עבר' if build.returncode == 0 else 'נכשל'} |",
        f"| `python3 tests/ui/ui_acceptance.py` (Chromium, 1366×768) | {ui_pass}/{len(ui_lines)} בדיקות עברו |", "",
        "## תנאי הקבלה", "",
        "| מזהה | תנאי | ראיה | תוצאה |", "|---|---|---|---|",
        *[f"| {a} | {t} | {e} | {r} |" for a, t, e, r in rows], "",
        "## פלט בדיקות הדפדפן", "", "```", *ui_lines, "```", "",
        "הדוח נוצר על ידי `python3 tools/acceptance_report.py`. שינוי בקוד מחייב הרצה מחדש של הדוח.", "",
    ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write("\n".join(md))
    print(f"{'OK' if all_ok else 'FAILED'}: unit {unit_pass}/{len(unit)}, ui {ui_pass}/{len(ui_lines)} -> {OUT}")
    sys.exit(0 if all_ok else 1)

main()
