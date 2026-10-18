# דוח קבלה · סימולטור אוטומטים, גרסה 1

- **תאריך:** 2026-10-18 13:26 (IDT)
- **גרסת קוד:** `362abb1`
- **סיכום:** כל 38 תנאי הקבלה עוברים

## הפקודות והפלט

| פקודה | תוצאה |
|---|---|
| `npx tsc --noEmit` | עבר |
| `npx vitest run` | 232/232 בדיקות עברו |
| `npx vite build` | עבר |
| `python3 tests/ui/ui_acceptance.py` (Chromium, 1366×768) | 28/28 בדיקות עברו |

## תנאי הקבלה

| מזהה | תנאי | ראיה | תוצאה |
|---|---|---|---|
| AC-01 | מצב התחלתי אחד בדיוק; בלי מצב התחלתי F-02 | vitest: F-02-no-start (5/5); דפדפן: AC-01 (1/1) | עובר |
| AC-02 | גרף, טבלה ושלשות הם מודל אחד | דפדפן: AC-02 (1/1) | עובר |
| AC-03 | שינוי שם לא מנתק מעברים; שם כפול נדחה | vitest: renaming a state (1/1); vitest: unique-labels (5/5); דפדפן: AC-03 (1/1) | עובר |
| AC-04 | F-03 / F-04 חוסמים הרצה ומציינים מצב וסמל | vitest: F-03-missing-transition (5/5); vitest: F-04-two-targets-dfa (5/5) | עובר |
| AC-05 | כל אסד״מ ב-fixtures תקין; מעבר זהה נשמר פעם אחת | vitest: loads and has no validation errors (31/31); vitest: F-04-not-for-identical (6/6) | עובר |
| AC-06 | אס״ד לא מלא נתקע ומציג יתרת קלט | vitest: partial DFA stuck (1/1); vitest: partial-starts-with-ab / matches every expected run (1/1) | עובר |
| AC-07 | השלמה לאסד״מ: עותק, מלכודת אחת, סימון מה נוסף | vitest: T-7 completes (1/1); vitest: AC-07 (1/1); דפדפן: AC-07 (2/2) | עובר |
| AC-08 | א״ס: אפס, אחד או כמה יעדים | vitest: nfa-slide29 / matches every expected run (1/1); vitest: synthetic-set-merge / matches every expected run (1/1) | עובר |
| AC-09 | קבלה בא״ס, קבוצות ומסלול מקבל (שקף 33) | vitest: nfa-slide33.json / matches every expected run (1/1) | עובר |
| AC-10 | כשכל המסלולים נכשלים: דחייה ויתרת קלט | vitest: NFA: F-15 when some paths fail (1/1); vitest: synthetic-tree-stuck-branches / matches every expected run (1/1) | עובר |
| AC-11 | אין הכרעה לפני סוף הקלט | vitest: decides only after the last symbol (1/1) | עובר |
| AC-12 | ε לפי המצב ההתחלתי, בלי צעדים | vitest: AC-12 (1/1) | עובר |
| AC-13 | צעד אחורה משחזר במדויק | דפדפן: AC-13 (1/1) | עובר |
| AC-14 | סמל שאינו ב-Σ: F-11 עם מיקום (0312) | vitest: input cases (F-11) (2/2); vitest: unknown symbol: F-11 (1/1) | עובר |
| AC-15 | לולאה ומלכודת לא עוצרות | vitest: trap is an ordinary state (1/1) | עובר |
| AC-16 | שמירה וטעינה משחזרות הכול כולל משימה | vitest: AC-16 (1/1); vitest: loads and has no validation errors (31/31) | עובר |
| AC-17 | קובץ פגום / גרסה לא נתמכת נדחים | vitest: broken file is rejected (1/1); vitest: unsupported schema version (1/1); דפדפן: AC-17 (1/1) | עובר |
| AC-18 | מחיקת מצב: מעברים, אזהרה, ביטול | דפדפן: AC-18 (1/1) | עובר |
| AC-19 | שינוי אלפבית מסמן F-05 ולא מוחק | vitest: AC-19 (1/1) | עובר |
| AC-20 | כל מקרי התקינות מדויקים; הודעות בעברית | vitest: produces exactly the expected errors (14/14); vitest: every message is Hebrew text (14/14) | עובר |
| AC-21 | מצב בלי מקרא: אזהרה F-09 | vitest: F-09-missing-memory (5/5) | עובר |
| AC-22 | T-2: כל המילים באורך המינימלי (12, 13, 14, 8, 9) | vitest: AC-22 (3/3) | עובר |
| AC-23 | כל ערכי expected בכל ה-fixtures משתחזרים | vitest: matches every expected run (31/31); vitest: matches the analysis tools (31/31) | עובר |
| AC-24 | אוטומט לא תקין נשמר עם אזהרה ונטען עם אותן שגיאות | vitest: an invalid automaton saves and reloads (1/1); דפדפן: AC-24 (2/2) | עובר |
| AC-25 | SVG ו-PNG שומרים סימונים | דפדפן: AC-25 (2/2) | עובר |
| AC-26 | קריאות: 14px, 4.5:1, 150%, סרט החרוזים LTR | דפדפן: AC-26 (5/5) | עובר |
| AC-27 | סמל מרובה-תווים; [ab] מול [a,b] | vitest: AC-27 (2/2) | עובר |
| AC-28 | סמל ריק, רווח, פסיק, כפול או ε נדחה | vitest: F-01-epsilon-symbol (5/5); vitest: F-06-symbol-with-comma (5/5); vitest: F-06-symbol-with-space (5/5) | עובר |
| AC-29 | משימה: כלים שנבחרו, נעילה, עבודה חופשית | דפדפן: AC-29 (2/2) | עובר |
| AC-30 | מלכודות לפי ההגדרה (q4, q9); מצב מת רק ב-T-6 | vitest: AC-30 (1/1) | עובר |
| AC-31 | עץ חישוב: כלל 16 העלים במקרי הקצה | vitest: synthetic-tree-limit / matches every expected run (1/1); vitest: synthetic-tree-stuck-branches / matches every expected run (1/1); vitest: tree: hidden message (1/1) | עובר |
| AC-32 | טיוטה: שחזור, מחיקה, בלי דריסה שקטה | דפדפן: AC-32 (1/1) | עובר |
| AC-33 | בהרצה העריכה נעולה; שינוי מילה מבטל; Undo/Redo | דפדפן: AC-33 (1/1); דפדפן: A second word (1/1); דפדפן: Ctrl+Z (1/1) | עובר |
| AC-34 | שינוי סוג מציג הפרות וחזרה משחזרת | vitest: AC-34 (1/1); vitest: changing the type (2/2) | עובר |
| AC-35 | T-4: הודעת חיתוך מעל 200 | vitest: AC-35 (1/1); vitest: T-4 caps at 200 (1/1) | עובר |
| AC-36 | כל תנאי קבלה מתועד עם פקודה, פלט ותאריך | הדוח הזה | עובר |
| AC-37 | מילות בדיקה: טעויות מוסברות, נכונות מסומנות | vitest: T-3 explains (1/1); דפדפן: AC-37 (1/1) | עובר |
| AC-38 | מצב הצגה: בלי לוח צד, 28px ומעלה, יציאה | דפדפן: AC-38 (1/1) | עובר |

## פלט בדיקות הדפדפן

```
PASS AC-01 new automaton has a start state
PASS AC-02 graph, table and triples are one model  (labels=['a,b', 'c', 'a', 'b,c', 'a,b,c'])
PASS AC-18 delete state removes its transitions, can be undone  (q1 נמחק יחד עם המעברים שלו. אפשר לבטל.)
PASS Editing: state toolbar, double-click toggles accepting, Delete removes an arrow  (bar=True on=True off=True states=3 edges 5->4)
PASS Ctrl+Z undoes with a Hebrew keyboard layout
PASS Editing an arrow: its target can be changed (and undone)  (q0 q0 q0 / q2 q2 q2)
PASS AC-03 duplicate state name refused, valid rename applied  (['q0', 'q1', 'q2'] -> ['q0', 'ראיתי a', 'q2'])
PASS AC-33 editing locked while running; changing the word resets  (נקראו 0 מתוך 3 סמלים)
PASS AC-13 step back restores the previous configuration  (q0 -a-> q1 | q0 -a-> q1 -b-> q0)
PASS A second word runs after the first one finished
PASS AC-26 all text at least 14px (run screen)  (min 14.0px at DIV:מילים שמכילות את הרצ)
PASS AC-26 all text at least 14px (build screen)  (min 14.0px at BUTTON:חדש)
PASS AC-38 presentation: no side panel/table/tools, names >= 28px, controls work, Esc restores  (min label 30.0px)
PASS AC-26 text contrast at least 4.5:1  (build [] run [])
PASS AC-26 Hebrew beads: tape cells left to right in reading order  ([['כ', 37], ['א', 93], ['ב', 149]])
PASS AC-25 SVG export keeps start, accepting and trap marks
PASS AC-25 PNG export
PASS AC-07 completion marks the trap and the added transitions  (edges=3 cells=4)
PASS AC-07 undo returns to the original partial DFA
PASS AC-24 invalid automaton saves with a warning  (נשמר עם 1 שגיאות. הן יסומנו שוב כשתפתחו את הקובץ.)
PASS AC-17 broken file rejected, open work unchanged  (הקובץ פגום: זה לא קובץ JSON תקין. האוטומט הפתוח לא השתנה.)
PASS AC-24 reloaded file shows the same errors
PASS AC-32 draft offered after reload, can be deleted or restored  (offered=True deleted=True restored=טיוטה לבדיקה)
PASS AC-29 student sees only the chosen tools and a locked automaton  (tools=['T-1', 'T-8'])
PASS AC-37 test words: wrong ones explained, right ones marked
PASS AC-29 teacher / free work: all tools open  (['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-8', 'T-9'])
PASS AC-26 usable at 150% zoom (no horizontal scroll)  (overflow 0px)
PASS no page errors
```

הדוח נוצר על ידי `python3 tools/acceptance_report.py`. שינוי בקוד מחייב הרצה מחדש של הדוח.
