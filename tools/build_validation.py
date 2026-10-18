import json, sys, os
OUT = sys.argv[1]

def st(i, label, memory="x"):
    return {"id": f"s{i}", "label": label, "x": 80 + 150 * i, "y": 100, "memory": memory}

def auto(typ, alphabet, states, start, acc, trans):
    return {"schemaVersion": 1, "type": typ, "alphabet": alphabet, "states": states,
            "initialStateId": start, "acceptingStateIds": acc,
            "transitions": [{"id": f"t{i}", "from": f, "symbol": c, "to": t} for i, (f, c, t) in enumerate(trans)]}

full_ok = [("s0", "a", "s1"), ("s0", "b", "s0"), ("s1", "a", "s1"), ("s1", "b", "s0")]
cases = [
    {"caseId": "F-01-epsilon-symbol", "description": "ε מוגדר כסמל באלפבית ומשמש בחץ",
     "automaton": auto("nfa", ["a", "ε"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"], [("s0", "ε", "s1")]),
     "expectedIssues": [{"code": "F-01", "severity": "error"}], "runnable": False},
    {"caseId": "F-02-no-start", "description": "אין מצב התחלתי",
     "automaton": auto("dfa-full", ["a", "b"], [st(0, "q0"), st(1, "q1")], None, ["s1"], full_ok),
     "expectedIssues": [{"code": "F-02", "severity": "error"}], "runnable": False},
    {"caseId": "F-03-missing-transition", "description": "אסד״מ: חסר מעבר מ-q1 ב-b",
     "automaton": auto("dfa-full", ["a", "b"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"], full_ok[:3]),
     "expectedIssues": [{"code": "F-03", "severity": "error", "state": "q1", "symbol": "b"}], "runnable": False},
    {"caseId": "F-04-two-targets-dfa", "description": "אס״ד לא מלא: שני יעדים מ-q0 ב-a",
     "automaton": auto("dfa-partial", ["a", "b"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"],
                       [("s0", "a", "s0"), ("s0", "a", "s1")]),
     "expectedIssues": [{"code": "F-04", "severity": "error", "state": "q0", "symbol": "a"}], "runnable": False},
    {"caseId": "F-04-not-for-identical", "description": "מעבר זהה שהוזן פעמיים נשמר פעם אחת ואינו שגיאה",
     "automaton": auto("dfa-full", ["a", "b"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"], full_ok + [full_ok[0]]),
     "expectedIssues": [], "expectedTransitionCountAfterLoad": 4, "runnable": True},
    {"caseId": "F-05-removed-symbol", "description": "מעבר על הסמל c שהוסר מהאלפבית; המעבר נשמר ומסומן",
     "automaton": auto("dfa-partial", ["a", "b"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"],
                       [("s0", "a", "s1"), ("s0", "c", "s1")]),
     "expectedIssues": [{"code": "F-05", "severity": "error", "symbol": "c"}], "runnable": False},
    {"caseId": "F-06-symbol-with-comma", "description": "סמל שמכיל פסיק",
     "automaton": auto("dfa-partial", ["a", "b,c"], [st(0, "q0")], "s0", [], []),
     "expectedIssues": [{"code": "F-06", "severity": "error", "symbol": "b,c"}], "runnable": False},
    {"caseId": "F-06-symbol-with-space", "description": "סמל שמכיל רווח",
     "automaton": auto("dfa-partial", ["a", "on off"], [st(0, "q0")], "s0", [], []),
     "expectedIssues": [{"code": "F-06", "severity": "error", "symbol": "on off"}], "runnable": False},
    {"caseId": "F-07-trap-without-all-loops", "description": "אסד״מ: מלכודת q2 עם לולאה על a בלבד",
     "automaton": auto("dfa-full", ["a", "b"], [st(0, "q0"), st(1, "q1"), st(2, "q2")], "s0", ["s1"],
                       [("s0", "a", "s1"), ("s0", "b", "s2"), ("s1", "a", "s1"), ("s1", "b", "s1"), ("s2", "a", "s2")]),
     "expectedIssues": [{"code": "F-07", "severity": "error", "state": "q2", "symbol": "b"}], "mustNotInclude": ["F-03"],
     "runnable": False,
     "note": "כלל קדימות: לכל תא חסר מופקת הודעה אחת בלבד. אם המצב נראה כמלכודת (לא מקבל, לולאה אחת לפחות, אין מעבר למצב אחר) - F-07; אחרת F-03"},
    {"caseId": "F-03-not-F-07-when-exit", "description": "אסד״מ: q1 עם לולאה על a ומעבר ל-q0, חסר מעבר ב-c; אינו נראה כמלכודת",
     "automaton": auto("dfa-full", ["a", "b", "c"], [st(0, "q0"), st(1, "q1")], "s0", ["s0"],
                       [("s0", "a", "s1"), ("s0", "b", "s0"), ("s0", "c", "s0"), ("s1", "a", "s1"), ("s1", "b", "s0")]),
     "expectedIssues": [{"code": "F-03", "severity": "error", "state": "q1", "symbol": "c"}], "mustNotInclude": ["F-07"],
     "runnable": False},
    {"caseId": "F-08-unreachable", "description": "q2 אינו ניתן להשגה",
     "automaton": auto("dfa-full", ["a"], [st(0, "q0"), st(1, "q1"), st(2, "q2")], "s0", ["s1"],
                       [("s0", "a", "s1"), ("s1", "a", "s1"), ("s2", "a", "s1")]),
     "expectedIssues": [{"code": "F-08", "severity": "warning", "state": "q2"}], "runnable": True},
    {"caseId": "F-09-missing-memory", "description": "למצב q1 אין מקרא",
     "automaton": auto("dfa-full", ["a"], [st(0, "q0"), st(1, "q1", "")], "s0", ["s1"],
                       [("s0", "a", "s1"), ("s1", "a", "s1")]),
     "expectedIssues": [{"code": "F-09", "severity": "warning", "state": "q1"}], "runnable": True},
    {"caseId": "F-10-nfa-actually-deterministic", "description": "סומן כא״ס אבל אין תא עם כמה יעדים",
     "automaton": auto("nfa", ["a"], [st(0, "q0"), st(1, "q1")], "s0", ["s1"], [("s0", "a", "s1")]),
     "expectedIssues": [{"code": "F-10", "severity": "warning"}], "runnable": True},
    {"caseId": "unique-labels", "description": "שני מצבים עם אותה תווית",
     "automaton": auto("dfa-full", ["a"], [st(0, "q0"), st(1, "q0")], "s0", [],
                       [("s0", "a", "s1"), ("s1", "a", "s1")]),
     "expectedIssues": [{"code": "label-duplicate", "severity": "error"}], "runnable": False,
     "note": "אין לזה קוד בקטלוג; מוצע להוסיף"},
]
input_cases = {
    "description": "שגיאות קלט: מילה עם סמל שאינו באלפבית (F-11)",
    "automaton": auto("dfa-full", ["0", "1", "2"], [st(0, "q0")], "s0", ["s0"],
                      [("s0", "0", "s0"), ("s0", "1", "s0"), ("s0", "2", "s0")]),
    "words": [
        {"typed": "0312", "expectedIssue": {"code": "F-11", "symbol": "3", "position": 1},
         "note": "מיקום מאופס: 3 הוא הסמל השני ב-0312 (הנוסח בקטלוג תוקן מ'השלישי' ל'השני')"},
        {"typed": "0102", "expectedIssue": None}],
}
json.dump({"cases": cases, "inputCases": input_cases}, open(os.path.join(OUT, "_validation-cases.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print(len(cases), "validation cases")
