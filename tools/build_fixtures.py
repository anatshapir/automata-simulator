"""Build verified fixtures for the automata simulator.

Every expected value is computed by the reference engine below, then
cross-checked against (a) results stated explicitly in the course materials
and (b) a brute-force comparison with the language definition.
Any disagreement aborts the build.
"""
import json, os, sys, time
T0 = time.time()
from itertools import product
from collections import deque

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- engine
class A:
    def __init__(s, typ, alphabet, states, start, accepting, trans):
        s.type, s.alphabet, s.states = typ, alphabet, states  # states: [(label, memory)]
        s.labels = [l for l, _ in states]
        s.start, s.acc = start, set(accepting)
        s.trans = trans  # [(from, sym, to)]
        s.d = {}
        for f, c, t in trans:
            s.d.setdefault((f, c), set()).add(t)

    def step(s, S, c):
        out = set()
        for q in S:
            out |= s.d.get((q, c), set())
        return out

    def run(s, w):
        if s.type in ("dfa-full", "dfa-partial"):
            q, path = s.start, [s.start]
            for i, c in enumerate(w):
                nxt = s.d.get((q, c))
                if not nxt:
                    return {"accepted": False, "path": path,
                            "stuck": {"atIndex": i, "state": q, "symbol": c},
                            "unreadSymbols": w[i:]}
                (q,) = nxt
                path.append(q)
            return {"accepted": q in s.acc, "path": path, "stuck": None, "unreadSymbols": []}
        # NFA
        S, sets = {s.start}, [[s.start]]
        for i, c in enumerate(w):
            S = s.step(S, c)
            sets.append(sorted(S, key=s.labels.index))
            if not S:
                return {"accepted": False, "activeSets": sets, "emptyAtIndex": i,
                        "unreadSymbols": w[i + 1:], "oneAcceptingPath": None}
        acc = bool(S & s.acc)
        return {"accepted": acc, "activeSets": sets, "emptyAtIndex": None,
                "unreadSymbols": [], "oneAcceptingPath": s.one_path(w) if acc else None}

    def one_path(s, w):
        # backtrack from an accepting state through the stored layers
        layers = [{s.start}]
        for c in w:
            layers.append(s.step(layers[-1], c))
        end = sorted(layers[-1] & s.acc, key=s.labels.index)[0]
        path = [end]
        for i in range(len(w) - 1, -1, -1):
            prev = sorted([p for p in layers[i] if path[0] in s.d.get((p, w[i]), set())],
                          key=s.labels.index)[0]
            path.insert(0, prev)
        return path

    def accepts(s, w):
        return s.run(w)["accepted"]

    def shortest(s, maxlen=None):
        """All accepted words of minimal length, via BFS over state sets (exact, fast)."""
        start = frozenset([s.start])
        # forward BFS to collect reachable subsets
        seen, order, dq = {start}, [start], deque([start])
        while dq:
            S = dq.popleft()
            for c in s.alphabet:
                T = frozenset(s.step(S, c))
                if T not in seen:
                    seen.add(T); order.append(T); dq.append(T)
        # distance to acceptance (backward fixpoint)
        INF = float("inf")
        dist = {S: (0 if S & s.acc else INF) for S in seen}
        changed = True
        while changed:
            changed = False
            for S in seen:
                for c in s.alphabet:
                    T = frozenset(s.step(S, c))
                    if dist[T] + 1 < dist[S]:
                        dist[S] = dist[T] + 1; changed = True
        k = dist[start]
        if k == INF:
            return []
        out = []
        def dfs(S, rem, prefix):
            if rem == 0:
                if S & s.acc: out.append(list(prefix))
                return
            for c in s.alphabet:
                T = frozenset(s.step(S, c))
                if dist[T] <= rem - 1:
                    dfs(T, rem - 1, prefix + [c])
        dfs(start, k, [])
        return out

    def tree(s, w, limit=16):
        """Computation tree summary (NFA). Leaves: accepting / rejecting (read all, not accepting) / stuck."""
        # count leaves by DP over (depth,state) multiplicities
        layer = {s.start: 1}; stuck = 0
        for i, c in enumerate(w):
            nxt = {}
            for q, m in layer.items():
                ts = s.d.get((q, c), set())
                if not ts: stuck += m
                for t in ts: nxt[t] = nxt.get(t, 0) + m
            layer = nxt
        acc = sum(m for q, m in layer.items() if q in s.acc)
        rej = sum(m for q, m in layer.items() if q not in s.acc)
        total = acc + rej + stuck
        def acc_paths(cap):
            res = []
            def go(q, i, path):
                if len(res) >= cap: return
                if i == len(w):
                    if q in s.acc: res.append(path)
                    return
                for t in sorted(s.d.get((q, w[i]), set()), key=s.labels.index):
                    go(t, i + 1, path + [t])
            go(s.start, 0, [s.start]); return res
        if total <= limit:
            rule, shown = "full", None
            hidden = {"total": 0, "accepting": 0, "rejecting": 0, "stuck": 0}
        else:
            shown = acc_paths(limit)
            rule = "acceptingOnly"
            hidden = {"total": total - len(shown), "accepting": acc - len(shown), "rejecting": rej, "stuck": stuck}
        return {"totalLeaves": total, "leaves": {"accepting": acc, "rejecting": rej, "stuck": stuck},
                "displayRule": rule, "shownAcceptingPaths": shown, "hidden": hidden}

    def reachable(s):
        seen, dq = {s.start}, deque([s.start])
        while dq:
            q = dq.popleft()
            for c in s.alphabet:
                for t in s.d.get((q, c), set()):
                    if t not in seen:
                        seen.add(t); dq.append(t)
        return seen

    def live(s):
        live = set(s.acc)
        changed = True
        while changed:
            changed = False
            for (f, c), ts in s.d.items():
                if f not in live and ts & live:
                    live.add(f); changed = True
        return live

    def traps(s):
        out = []
        for q in s.labels:
            if q in s.acc:
                continue
            outs = [(c, t) for (f, c), ts in s.d.items() if f == q for t in ts]
            if outs and all(t == q for _, t in outs):
                out.append(q)
        return out

    def complete(s, trap_label):
        tr = list(s.trans)
        added = []
        for q in s.labels:
            for c in s.alphabet:
                if (q, c) not in s.d:
                    tr.append((q, c, trap_label)); added.append([q, c, trap_label])
        for c in s.alphabet:
            tr.append((trap_label, c, trap_label))
        return tr, added

    def to_json(s, title):
        ids = {l: f"s{i}" for i, (l, _) in enumerate(s.states)}
        per_row = 5
        return {
            "schemaVersion": 1, "type": s.type, "title": title,
            "alphabet": s.alphabet,
            "states": [{"id": ids[l], "label": l,
                        "x": 80 + 150 * (i % per_row), "y": 100 + 140 * (i // per_row),
                        "memory": m} for i, (l, m) in enumerate(s.states)],
            "initialStateId": ids[s.start],
            "acceptingStateIds": [ids[l] for l in s.labels if l in s.acc],
            "transitions": [{"id": f"t{i}", "from": ids[f], "symbol": c, "to": ids[t]}
                            for i, (f, c, t) in enumerate(s.trans)],
        }

def table(rows, alphabet):
    """rows: {state: [target per symbol, None = empty]} (insertion order)."""
    tr = []
    for q, targets in rows.items():
        for c, t in zip(alphabet, targets):
            if t is None:
                continue
            for x in (t if isinstance(t, (list, tuple)) else [t]):
                tr.append((q, c, x))
    return tr

def W(s, alphabet):
    """word string -> symbol list (single-char alphabets only)."""
    return list(s)

# ---------------------------------------------------------------- fixtures
FIX = []
def fixture(fid, title, source, a, lang_desc, lang=None, maxlen=8, stated_runs=(),
            extra_words=(), stated_shortest=None, stated_counts=None, stated_traps=None,
            completion=None, known_defect=None):
    # 1) language check
    mism = None
    if lang is not None:
        mism = []
        for L in range(maxlen + 1):
            for t in product(a.alphabet, repeat=L):
                w = list(t)
                if a.accepts(w) != lang(w):
                    mism.append(w)
        if mism and not known_defect:
            sys.exit(f"{fid}: automaton disagrees with language on {mism[:5]}")
        if known_defect and (not mism or sorted(mism, key=len)[0] != known_defect["shortestCounterexample"]):
            sys.exit(f"{fid}: expected defect not reproduced")
    # 2) runs
    runs = []
    for item in stated_runs:
        w, acc = item[0], item[1]
        path = item[2] if len(item) > 2 else None
        r = a.run(w)
        if r["accepted"] != acc:
            sys.exit(f"{fid}: {w} stated {acc}, engine {r['accepted']}")
        if path is not None:
            got = r.get("path") or r.get("oneAcceptingPath")
            if got != path:
                sys.exit(f"{fid}: {w} stated path {path}, engine {got}")
        if a.type == "nfa": r["tree"] = a.tree(w)
        runs.append({"word": w, "statedInSource": True, **r})
    for w in extra_words:
        r = a.run(w)
        if a.type == "nfa": r["tree"] = a.tree(w)
        runs.append({"word": w, "statedInSource": False, **r})
    # 3) analysis
    sh = a.shortest()
    if stated_shortest is not None and sorted(map(tuple, sh)) != sorted(map(tuple, stated_shortest)):
        sys.exit(f"{fid}: shortest {sh} vs stated {stated_shortest}")
    counts = {"states": len(a.labels), "transitions": len(a.trans),
              "selfLoops": sum(1 for f, _, t in a.trans if f == t)}
    if stated_counts and any(counts[k] != v for k, v in stated_counts.items()):
        sys.exit(f"{fid}: counts {counts} vs stated {stated_counts}")
    traps = a.traps()
    if stated_traps is not None and sorted(traps) != sorted(stated_traps):
        sys.exit(f"{fid}: traps {traps} vs stated {stated_traps}")
    reach = a.reachable()
    live = a.live()
    exp = {
        "acceptsEpsilon": a.accepts([]),
        "shortestAcceptedWords": sh,
        "counts": counts,
        "unreachableStates": [q for q in a.labels if q not in reach],
        "deadStates": [q for q in a.labels if q not in live],
        "trapStates": traps,
        "runs": runs,
    }
    if completion:
        exp["completion"] = completion
    doc = {
        "fixtureId": fid,
        "source": source,
        "language": {"description": lang_desc,
                     "bruteForceCheckedUpToLength": maxlen if lang else None,
                     "mismatches": (len(mism) if mism is not None else None),
                     **({"knownSourceDefect": {**known_defect, "mismatchCountUpToLength": len(mism)}} if known_defect else {})},
        "verification": {
            "sourceStatus": source.get("status"),
            "languageBruteForceUpToLength": maxlen if lang else None,
            "statedRunsCheckedAgainstEngine": sum(1 for r in runs if r["statedInSource"]),
            "knownSourceDefect": bool(known_defect),
        },
        "automaton": a.to_json(title),
        "expected": exp,
    }
    FIX.append(fid)
    with open(os.path.join(OUT, f"{fid}.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

def src(material, location, status, note=None):
    d = {"material": material, "location": location, "status": status}
    if note:
        d["note"] = note
    return d

INTRO = "מצגת מבוא לחישוביות (55 שקפים)"
SHEET = "דף תרגילים לשיעורי בית: מבוא למודלים חישוביים"
PDECK = "מצגת אס״ד לא מלא וא״ס לא דטרמיניסטי"

# --- intro: even length
a = A("dfa-full", ["0", "1"], [("q0", "עד עכשיו זוגי"), ("q1", "עד עכשיו אי-זוגי")], "q0", ["q0"],
      table({"q0": ["q1", "q1"], "q1": ["q0", "q0"]}, ["0", "1"]))
fixture("intro-even-length", "מילים באורך זוגי מעל {0,1}",
        src(INTRO, "שקפים 31-32", "stated-in-source"), a,
        "כל המילים מעל {0,1} שאורכן זוגי", lambda w: len(w) % 2 == 0, 10,
        stated_runs=[(W("0110", 0), True, ["q0", "q1", "q0", "q1", "q0"]),
                     (W("101", 0), False, ["q0", "q1", "q0", "q1"]),
                     ([], True, ["q0"]),
                     (W("11", 0), True, ["q0", "q1", "q0"]),
                     (W("010", 0), False, ["q0", "q1", "q0", "q1"])])

# --- intro: contains aa (practice 1)
ab3 = ["a", "b", "c"]
a = A("dfa-full", ab3, [("q0", "עוד לא היה aa, והתו האחרון אינו a"), ("q1", "התו האחרון a"),
                        ("q2", "הרצף aa כבר הופיע")], "q0", ["q2"],
      table({"q0": ["q1", "q0", "q0"], "q1": ["q2", "q0", "q0"], "q2": ["q2", "q2", "q2"]}, ab3))
fixture("intro-contains-aa", "מילים שמכילות את הרצף aa",
        src(INTRO, "שקפים 35, 40-41 (תרגול 1)", "stated-in-source"), a,
        "כל המילים מעל {a,b,c} שמכילות את הרצף aa", lambda w: "aa" in "".join(w), 8,
        stated_runs=[(W("abaa", 0), True, ["q0", "q1", "q0", "q1", "q2"]),
                     (W("aabc", 0), True, ["q0", "q1", "q2", "q2", "q2"]),
                     (W("baba", 0), False, ["q0", "q0", "q1", "q0", "q1"]),
                     ([], False, ["q0"]),
                     (W("cba", 0), False, ["q0", "q0", "q0", "q1"])],
        stated_shortest=[["a", "a"]])

# --- intro: drink machine
c = ["1", "2", "5"]
a = A("dfa-full", c, [("0₪", "שולם 0"), ("1₪", "שולם 1"), ("2₪", "שולם 2"), ("3₪+", "שולמו 3 לפחות")],
      "0₪", ["3₪+"],
      table({"0₪": ["1₪", "2₪", "3₪+"], "1₪": ["2₪", "3₪+", "3₪+"], "2₪": ["3₪+", "3₪+", "3₪+"],
             "3₪+": ["3₪+", "3₪+", "3₪+"]}, c))
fixture("intro-drink-machine", "מכונת משקאות", src(INTRO, "שקף 37 + פתרונות במערך השיעור", "stated-in-source",
        "שמות מצבים עם סימן ₪"), a,
        "רצפי מטבעות שסכומם 3 לפחות", lambda w: sum(map(int, w)) >= 3, 7,
        stated_runs=[(["1", "2"], True), (["1", "1", "1"], True), (["2"], False), (["5"], True)])

# --- intro: password checker
pa = ["a", "b", "c", "1", "2", "3"]
a = A("dfa-full", pa, [("q0", "עוד לא נקרא תו"), ("q1", "אות אחת בהתחלה"), ("q2", "ההתחלה תקינה, מחכים לספרה"),
                       ("q3", "כל התנאים התקיימו"), ("q4", "מלכודת: ספרה באחד משני התווים הראשונים")],
      "q0", ["q3"],
      table({"q0": ["q1"] * 3 + ["q4"] * 3, "q1": ["q2"] * 3 + ["q4"] * 3, "q2": ["q2"] * 3 + ["q3"] * 3,
             "q3": ["q3"] * 6, "q4": ["q4"] * 6}, pa))
L, D = set("abc"), set("123")
fixture("intro-password", "בודק סיסמאות", src(INTRO, "שקף 38", "stated-in-source"), a,
        "מתחילה בשתי אותיות ומכילה לפחות ספרה אחת",
        lambda w: len(w) >= 3 and w[0] in L and w[1] in L and any(x in D for x in w[2:]), 6,
        stated_runs=[(["a", "b", "1"], True), (list("cca2b"), True), (list("a12"), False),
                     (list("1ab"), False), (list("abc"), False)],
        stated_traps=["q4"])

# --- intro / basics deck: beads (Hebrew symbols)
hb = ["כ", "א", "ב"]
a = A("dfa-full", hb, [("q0", "עוד אין חרוזים"), ("q1", "החרוז האחרון כהה"), ("q2", "החרוז האחרון אמבר"),
                       ("q3", "החרוז האחרון בהיר"), ("q4", "שני חרוזים צמודים באותו צבע")], "q0", ["q1", "q2", "q3"],
      table({"q0": ["q1", "q2", "q3"], "q1": ["q4", "q2", "q3"], "q2": ["q1", "q4", "q3"],
             "q3": ["q1", "q2", "q4"], "q4": ["q4", "q4", "q4"]}, hb))
fixture("intro-beads-hebrew", "שרשרת חרוזים בשלושה צבעים",
        src(INTRO, "שקפים 49-50 (משימה 7)", "stated-in-source", "סמלי האלפבית באותיות עבריות; סרט הקלט מוצג משמאל לימין"), a,
        "לפחות חרוז אחד, ואין שני חרוזים צמודים באותו צבע",
        lambda w: len(w) >= 1 and all(w[i] != w[i + 1] for i in range(len(w) - 1)), 7,
        stated_runs=[(["א"], True), (list("כאב"), True), (list("אכאבכא"), True), ([], False),
                     (list("כבב"), False), (list("ככא"), False)],
        stated_traps=["q4"])

# --- sheet ex6 elevator (system description)
fl = ["1", "2", "3"]
a = A("dfa-full", fl, [("קומה 1", "המעלית בקומה 1"), ("קומה 2", "המעלית בקומה 2"), ("קומה 3", "המעלית בקומה 3")],
      "קומה 1", [],
      table({"קומה 1": ["קומה 1", "קומה 2", "קומה 3"], "קומה 2": ["קומה 1", "קומה 2", "קומה 3"],
             "קומה 3": ["קומה 1", "קומה 2", "קומה 3"]}, fl))
fixture("sheet-ex06-elevator", "מעלית בבניין 3 קומות", src(SHEET, "תרגיל 6", "stated-in-source",
        "תיאור מערכת ללא מצבים מקבלים"), a, "תיאור מערכת, ללא שפה", None,
        stated_counts={"states": 3, "transitions": 9, "selfLoops": 3}, stated_traps=[],
        extra_words=[["2", "3", "1"]])
fl2 = fl + ["עצירה"]
a = A("dfa-full", fl2, [("קומה 1", "המעלית בקומה 1"), ("קומה 2", "המעלית בקומה 2"), ("קומה 3", "המעלית בקומה 3"),
                        ("עצורה", "נלחץ לחצן עצירת חירום")], "קומה 1", [],
      table({"קומה 1": ["קומה 1", "קומה 2", "קומה 3", "עצורה"], "קומה 2": ["קומה 1", "קומה 2", "קומה 3", "עצורה"],
             "קומה 3": ["קומה 1", "קומה 2", "קומה 3", "עצורה"], "עצורה": ["עצורה"] * 4}, fl2))
fixture("sheet-ex06-elevator-emergency", "מעלית עם עצירת חירום", src(SHEET, "תרגיל 6 ★", "stated-in-source",
        "הסמל עצירה הוא סמל מרובה-תווים; ספירת 16 בפתרון היא ספירת מעברים (שלשות)"), a,
        "תיאור מערכת, ללא שפה", None,
        stated_counts={"states": 4, "transitions": 16}, stated_traps=["עצורה"],
        extra_words=[["2", "עצירה", "1"]])

# --- sheet ex7
ab = ["a", "b"]
a = A("dfa-full", ab, [("q0", "עוד לא נקרא תו"), ("q1", "התחילה ב-a, אורך אי-זוגי"),
                       ("q2", "התחילה ב-a, אורך זוגי"), ("q3", "התחילה ב-b (מלכודת)")], "q0", ["q2"],
      table({"q0": ["q1", "q3"], "q1": ["q2", "q2"], "q2": ["q1", "q1"], "q3": ["q3", "q3"]}, ab))
fixture("sheet-ex07", "מטבלת מעברים לאוטומט", src(SHEET, "תרגיל 7 + פתרון", "stated-in-source"), a,
        "מילים שמתחילות ב-a ואורכן זוגי", lambda w: len(w) > 0 and w[0] == "a" and len(w) % 2 == 0, 10,
        stated_runs=[(list("ab"), True, ["q0", "q1", "q2"]), (list("abba"), True, ["q0", "q1", "q2", "q1", "q2"]),
                     (list("ba"), False, ["q0", "q3", "q3"]), (list("aab"), False, ["q0", "q1", "q2", "q1"]),
                     ([], False, ["q0"])],
        stated_counts={"transitions": 8}, stated_traps=["q3"])

# --- sheet ex8
a = A("dfa-full", ab, [("q0", "נקראו 0 תווים"), ("q1", "נקרא תו אחד"), ("q2", "נקראו 2 תווים"),
                       ("q3", "נקראו יותר מ-2 תווים (מלכודת)")], "q0", ["q0", "q1", "q2"],
      table({"q0": ["q1", "q1"], "q1": ["q2", "q2"], "q2": ["q3", "q3"], "q3": ["q3", "q3"]}, ab))
fixture("sheet-ex08", "מילים באורך לכל היותר 2", src(SHEET, "תרגיל 8 + טבלת פתרון", "stated-in-source"), a,
        "כל המילים מעל {a,b} שאורכן לכל היותר 2", lambda w: len(w) <= 2, 10,
        extra_words=[[], list("ab"), list("aba")], stated_shortest=[[]], stated_traps=["q3"])

# --- sheet ex9
z = ["0", "1"]
a = A("dfa-full", z, [("q0", "מספר האפסים מודולו 3 הוא 0"), ("q1", "מספר האפסים מודולו 3 הוא 1"),
                      ("q2", "מספר האפסים מודולו 3 הוא 2")], "q0", ["q0"],
      table({"q0": ["q1", "q0"], "q1": ["q2", "q1"], "q2": ["q0", "q2"]}, z))
fixture("sheet-ex09", "מספר האפסים מתחלק ב-3", src(SHEET, "תרגיל 9 + טבלת פתרון", "stated-in-source"), a,
        "כל המילים מעל {0,1} שמספר האפסים בהן מתחלק ב-3", lambda w: w.count("0") % 3 == 0, 10,
        extra_words=[[], list("000"), list("0101"), list("10010")], stated_shortest=[[]])

# --- sheet ex10
a = A("dfa-full", ab3, [("q0", "עוד לא נקרא תו"), ("q1", "התחילה ב-a וזה התו היחיד"),
                        ("q2", "התחלה בסדר, אחרון a"), ("q3", "התחלה בסדר, אחרון לא a"),
                        ("q4", "התחילה ב-ab (מלכודת)")], "q0", ["q1", "q2"],
      table({"q0": ["q1", "q3", "q3"], "q1": ["q2", "q4", "q3"], "q2": ["q2", "q3", "q3"],
             "q3": ["q2", "q3", "q3"], "q4": ["q4", "q4", "q4"]}, ab3))
fixture("sheet-ex10", "מסתיימות ב-a ולא מתחילות ב-ab", src(SHEET, "תרגיל 10 + פתרון", "stated-in-source"), a,
        "כל המילים מעל {a,b,c} שמסתיימות ב-a ולא מתחילות ב-ab",
        lambda w: "".join(w).endswith("a") and not "".join(w).startswith("ab"), 8,
        extra_words=[list("aca"), list("aba"), list("ba")], stated_shortest=[["a"]], stated_traps=["q4"])

# --- sheet ex11
a = A("dfa-full", ab3, [("q0", "אפס מופעים, אחרון לא a"), ("q1", "אפס מופעים, אחרון a"),
                        ("q2", "מופע אחד, אחרון a"), ("q3", "מופע אחד, אחרון לא a"), ("q4", "שני מופעים לפחות")],
      "q0", ["q4"],
      table({"q0": ["q1", "q0", "q0"], "q1": ["q2", "q0", "q0"], "q2": ["q4", "q3", "q3"],
             "q3": ["q2", "q3", "q3"], "q4": ["q4", "q4", "q4"]}, ab3))
def occ(w, s):
    w = "".join(w); return sum(1 for i in range(len(w) - len(s) + 1) if w[i:i + len(s)] == s)
fixture("sheet-ex11", "הרצף aa מופיע לפחות פעמיים", src(SHEET, "תרגיל 11 + פתרון", "stated-in-source",
        "מופעים חופפים נספרים"), a,
        "כל המילים מעל {a,b,c} שהרצף aa מופיע בהן לפחות פעמיים (כולל חפיפה)", lambda w: occ(w, "aa") >= 2, 8,
        extra_words=[list("aaa"), list("aabaa"), list("aabca")], stated_shortest=[list("aaa")])

# --- sheet ex12
a = A("dfa-full", ab3, [("q0", "עוד לא היה aa, אחרון לא a"), ("q1", "עוד לא היה aa, אחרון a"),
                        ("q2", "סוף המילה aa"), ("q3", "היה aa, אחרון לא a"), ("q4", "היה aa, אחרון a בודדת"),
                        ("q5", "הופיע aaa (מלכודת)")], "q0", ["q3"],
      table({"q0": ["q1", "q0", "q0"], "q1": ["q2", "q0", "q0"], "q2": ["q5", "q3", "q3"],
             "q3": ["q4", "q3", "q3"], "q4": ["q2", "q3", "q3"], "q5": ["q5", "q5", "q5"]}, ab3))
fixture("sheet-ex12", "aa לפחות פעם, בלי aaa, לא מסתיימת ב-a", src(SHEET, "תרגיל 12 ★ + פתרון", "stated-in-source"), a,
        "כל המילים מעל {a,b,c} שלא מסתיימות ב-a, מכילות aa ולא מכילות aaa",
        lambda w: not "".join(w).endswith("a") and "aa" in "".join(w) and "aaa" not in "".join(w), 8,
        extra_words=[list("aaab"), list("aabaab")], stated_shortest=[list("aab"), list("aac")], stated_traps=["q5"])

# --- sheet ex13 (named groups expanded to explicit symbols)
a = A("dfa-full", pa, [("q0", "עוד לא נקרא תו"), ("q1", "התחילה באות, אורך 1"), ("q2", "התחילה באות, אורך 2"),
                       ("q3", "אורך 3 לפחות ואחרון אות"), ("q4", "אורך 3 לפחות ואחרון ספרה"),
                       ("q5", "התחילה בספרה (מלכודת)")], "q0", ["q4"],
      table({"q0": ["q1"] * 3 + ["q5"] * 3, "q1": ["q2"] * 6, "q2": ["q3"] * 3 + ["q4"] * 3,
             "q3": ["q3"] * 3 + ["q4"] * 3, "q4": ["q3"] * 3 + ["q4"] * 3, "q5": ["q5"] * 6}, pa))
fixture("sheet-ex13", "בודק סיסמאות: אות בהתחלה, ספרה בסוף, אורך 3 לפחות",
        src(SHEET, "תרגיל 13 ★ + פתרון", "stated-in-source",
            "בפתרון המקורי העמודות הן הקבוצות אות/ספרה; כאן הן פורקו ל-6 סמלים מפורשים כי אין קבוצות סמלים בגרסה 1. יש 54 מילים קצרות ביותר"),
        a, "מתחילה באות, מסתיימת בספרה, אורך 3 לפחות",
        lambda w: len(w) >= 3 and w[0] in L and w[-1] in D, 6,
        stated_runs=[(list("a11"), True)], extra_words=[list("1ab"), list("ab1c")], stated_traps=["q5"])

# --- sheet ex14 (diagram transcribed and verified)
a = A("dfa-full", ab, [("q0", "עוד לא נקרא תו"), ("q1", "מספר אי-זוגי של a ועוד אין b"),
                       ("q2", "מספר זוגי של a"), ("q3", "מספר אי-זוגי של a ואחריו b אחד"),
                       ("q4", "a אחרי b (מלכודת)"), ("q6", "מחזור ספירת b במודולו 3"),
                       ("q7", "מחזור ספירת b במודולו 3, מקבל"), ("q8", "מחזור ספירת b במודולו 3"),
                       ("q9", "המילה התחילה ב-b (מלכודת)")], "q0", ["q7"],
      [("q0", "a", "q1"), ("q0", "b", "q9"), ("q1", "a", "q2"), ("q1", "b", "q3"), ("q2", "a", "q1"),
       ("q2", "b", "q6"), ("q3", "a", "q4"), ("q3", "b", "q6"), ("q4", "a", "q4"), ("q4", "b", "q4"),
       ("q6", "a", "q4"), ("q6", "b", "q7"), ("q7", "a", "q4"), ("q7", "b", "q8"), ("q8", "a", "q4"),
       ("q8", "b", "q6"), ("q9", "a", "q9"), ("q9", "b", "q9")])
import re
def l14(w):
    m = re.fullmatch(r"(a*)(b*)", "".join(w))
    if not m: return False
    n, k = len(m.group(1)), len(m.group(2))
    if n < 1 or k < 2: return False
    return k % 3 == 0 if n % 2 == 1 else k % 3 == 2
fixture("sheet-ex14", "מאוטומט לשפה: aⁿbᵐ", src(SHEET, "תרגיל 14 (תרשים) + פתרון", "verified-visual",
        "המעברים הועתקו מתמונת התרשים ונבדקו מול נוסחת השפה שבפתרון. אין q5 בתרשים"), a,
        "L = { aⁿbᵐ | n ≥ 1, m ≥ 2, ואם n אי-זוגי אז m % 3 = 0, ואם n זוגי אז m % 3 = 2 }", l14, 12,
        stated_runs=[(list("aaabbb"), True), (list("aaaabb"), True), (list("aabbbbb"), True),
                     (list("aaaa"), False), (list("abba"), False), (list("abbbb"), False), (list("aaab"), False)],
        stated_shortest=[list("aabb"), list("abbb")], stated_traps=["q4", "q9"])

# --- partial DFA: starts with ab (incomplete-DFA deck)
a = A("dfa-partial", ab, [("q0", "עוד לא נקרא תו"), ("q1", "התחילה ב-a, מחכה ל-b"), ("q2", "התחילה ב-ab")],
      "q0", ["q2"], table({"q0": ["q1", None], "q1": [None, "q2"], "q2": ["q2", "q2"]}, ab))
tr, added = a.complete("q3")
full = A("dfa-full", ab, a.states + [("q3", "")], "q0", ["q2"], tr)
deck_full = {("q0", "a"): "q1", ("q0", "b"): "q3", ("q1", "a"): "q3", ("q1", "b"): "q2",
             ("q2", "a"): "q2", ("q2", "b"): "q2", ("q3", "a"): "q3", ("q3", "b"): "q3"}
if {(f, c): t for f, c, t in tr} != deck_full:
    sys.exit("completion differs from deck table")
fixture("partial-starts-with-ab", "אס״ד לא מלא: מתחילה ב-ab",
        src(PDECK, "שקפים 5-6 (טבלאות מלא ולא מלא)", "stated-in-source"), a,
        "כל המילים מעל {a,b} שמתחילות ב-ab", lambda w: "".join(w).startswith("ab"), 10,
        stated_runs=[(list("abba"), True, ["q0", "q1", "q2", "q2", "q2"])],
        extra_words=[list("ba"), list("aa"), list("aab")],
        completion={"newTrapLabelSuggested": "q3", "addedTransitions": added,
                    "note": "תואם לטבלת האסד״מ שבמצגת. המקור לא משתנה; ההשלמה נוצרת כעותק"})

# --- NFA slide 33
a = A("nfa", ab3, [("q0", "עוד לא נקרא תו"), ("q1", "התחילה ב-b, מחכה ל-aa"), ("q2", "נקרא a ראשון של aa"),
                   ("q3", "היה aa, מחכה ל-cc בסוף"), ("q4", "נקרא c ראשון של cc"), ("q5", "מסתיימת ב-cc")],
      "q0", ["q5"],
      [("q0", "b", "q1"), ("q1", "a", "q1"), ("q1", "b", "q1"), ("q1", "c", "q1"), ("q1", "a", "q2"),
       ("q2", "a", "q3"), ("q3", "a", "q3"), ("q3", "b", "q3"), ("q3", "c", "q3"), ("q3", "c", "q4"),
       ("q4", "c", "q5")])
fixture("nfa-slide33", "א״ס לא דטרמיניסטי: מתחילה ב-b, מכילה aa, מסתיימת ב-cc",
        src(PDECK, "שקף 33 (תרשים ומסלול)", "verified-visual",
            "התרשים והמסלול נבדקו חזותית; המסלול בשקף הוא מסלול מקבל תקף"), a,
        "מתחילה ב-b, מכילה aa ומסתיימת ב-cc",
        lambda w: "".join(w).startswith("b") and "aa" in "".join(w) and "".join(w).endswith("cc"), 8,
        stated_runs=[(list("bacbaaacc"), True, ["q0", "q1", "q1", "q1", "q1", "q1", "q2", "q3", "q4", "q5"])],
        extra_words=[list("baacc"), list("abaacc"), list("baac")],
        stated_shortest=[list("baacc")])

# --- synthetic: multi-character symbol ambiguity
ms = ["a", "b", "ab"]
a = A("dfa-full", ms, [("q0", "עוד לא נקרא הסמל ab"), ("q1", "נקרא הסמל ab")], "q0", ["q1"],
      table({"q0": ["q0", "q0", "q1"], "q1": ["q1", "q1", "q1"]}, ms))
fixture("synthetic-multichar-ambiguity", "סמל מרובה-תווים: [ab] מול [a,b]",
        src("סינתטי", "AC על בחירת רצף סמלים מפורש", "synthetic"), a,
        "מילים שמכילות את הסמל ab", lambda w: "ab" in w, 5,
        extra_words=[["ab"], ["a", "b"], ["b", "a", "ab"]])


# ================= NFA slides (verified visually) =================
def J(w): return "".join(w)
a = A("nfa", ab, [("q0", "עוד לא הופיע ab"), ("q1", "נקרא a שאולי פותח ab"), ("q2", "הרצף ab הופיע")], "q0", ["q2"],
      [("q0","a","q0"),("q0","b","q0"),("q0","a","q1"),("q1","b","q2"),("q2","a","q2"),("q2","b","q2")])
fixture("nfa-slide26-contains-ab", "א״ס: מכילות ab", src(PDECK, "שקפים 26-27 (תרשים וטבלה)", "verified-visual",
        "הטבלה בשקף 27 תואמת לתרשים: תא (q1,a) ריק, תא (q0,a) = q0,q1"), a,
        "מילים מעל {a,b} שמכילות ab", lambda w: "ab" in J(w), 10,
        extra_words=[list("ab"), list("ba"), list("aab"), list("bbbaab")], stated_shortest=[list("ab")])

a = A("nfa", ab, [("q0", "קורא את תחילת המילה"), ("q1", "נקרא b ראשון של bab"), ("q2", "נקרא ba"), ("q3", "המילה מסתיימת ב-bab")],
      "q0", ["q3"], [("q0","a","q0"),("q0","b","q0"),("q0","b","q1"),("q1","a","q2"),("q2","b","q3")])
fixture("nfa-slide28-ends-bab", "א״ס: מסתיימות ב-bab", src(PDECK, "שקף 28", "verified-visual",
        "בשקף הלולאה על q0 מסומנת a,b,c אבל השאלה מגדירה Σ={a,b}; ה-fixture לפי השאלה"), a,
        "מילים מעל {a,b} שמסתיימות ב-bab", lambda w: J(w).endswith("bab"), 10,
        extra_words=[list("bab"), list("babab"), list("baba")], stated_shortest=[list("bab")])

a = A("nfa", ab3, [("q0",""),("q1","נקרא a"),("q2","נקרא ac"),("q3","הופיע acb או bcc"),("q4","נקרא b"),("q5","נקרא bc")],
      "q0", ["q3"], [("q0","a","q0"),("q0","b","q0"),("q0","c","q0"),("q0","a","q1"),("q1","c","q2"),("q2","b","q3"),
      ("q3","a","q3"),("q3","b","q3"),("q3","c","q3"),("q0","b","q4"),("q4","c","q5"),("q5","c","q3")])
fixture("nfa-slide29-acb-or-bcc", "א״ס: מכילות acb או bcc", src(PDECK, "שקף 29", "verified-visual"), a,
        "מילים מעל {a,b,c} שמכילות acb או bcc", lambda w: "acb" in J(w) or "bcc" in J(w), 8,
        extra_words=[list("acb"), list("bcc"), list("acbcc"), list("abc")])

a = A("nfa", ab3, [("q"+str(i), "") for i in range(12)], "q0", ["q6"],
      [("q0","a","q0"),("q0","b","q0"),("q0","c","q0"),("q0","a","q1"),("q1","c","q2"),("q2","b","q3"),
       ("q3","a","q3"),("q3","b","q3"),("q3","c","q3"),("q3","b","q4"),("q4","c","q5"),("q5","c","q6"),
       ("q6","a","q6"),("q6","b","q6"),("q6","c","q6"),("q0","b","q7"),("q7","c","q8"),("q8","c","q9"),
       ("q9","a","q9"),("q9","b","q9"),("q9","c","q9"),("q9","a","q10"),("q10","c","q11"),("q11","b","q6")])
fixture("nfa-slide30-acb-and-bcc-SOURCE-DEFECT", "א״ס בשקף 30: מכילות acb וגם bcc (שגוי במקור)",
        src(PDECK, "שקף 30", "verified-visual",
            "האוטומט בשקף אינו מקבל מילים שבהן acb ו-bcc חופפים (b משותף), למשל acbcc. ה-fixture משמר את האוטומט כפי שהוא בשקף ובודק שהמנוע מריץ אותו נאמנה; אין להשתמש בו כפתרון"),
        a, "מילים מעל {a,b,c} שמכילות acb וגם bcc (בכל סדר)",
        lambda w: "acb" in J(w) and "bcc" in J(w), 8,
        extra_words=[list("acbcc"), list("acbbcc"), list("bccacb")],
        known_defect={"shortestCounterexample": list("acbcc"),
                      "explanation": "acbcc בשפה (acb בתחילה, bcc בסוף, חופפים ב-b) אבל האוטומט דוחה אותה"})

a = A("nfa", ab3, [("q0",""),("q1","נקרא a ראשון"),("q2","נקרא b ראשון"),("q3","נקרא c ראשון"),("q4","שני התווים האחרונים זהים")],
      "q0", ["q4"], [("q0","a","q0"),("q0","b","q0"),("q0","c","q0"),("q0","a","q1"),("q0","b","q2"),("q0","c","q3"),
      ("q1","a","q4"),("q2","b","q4"),("q3","c","q4")])
fixture("nfa-slide31-ends-double", "א״ס: מסתיימות בשתי אותיות זהות", src(PDECK, "שקף 31", "verified-visual"), a,
        "מילים מעל {a,b,c} שמסתיימות בשתי אותיות זהות", lambda w: len(w) >= 2 and w[-1] == w[-2], 8,
        extra_words=[list("abb"), list("aab"), list("ccc")], stated_shortest=[list("aa"), list("bb"), list("cc")])

a = A("nfa", ab3, [("q0",""),("q1","התחילה ב-a"),("q2","התחילה ב-b"),("q3","התחילה ב-c"),("q4","האחרונה שווה לראשונה")],
      "q0", ["q4"], [("q0","a","q1"),("q0","b","q2"),("q0","c","q3")] +
      [(q,c,q) for q in ("q1","q2","q3") for c in ab3] + [("q1","a","q4"),("q2","b","q4"),("q3","c","q4")])
fixture("nfa-slide32-first-equals-last", "א״ס: הראשונה שווה לאחרונה", src(PDECK, "שקף 32", "verified-visual"), a,
        "מילים מעל {a,b,c} באורך 2 לפחות שבהן האות הראשונה זהה לאחרונה",
        lambda w: len(w) >= 2 and w[0] == w[-1], 8,
        extra_words=[list("abca"), list("abc"), list("a")], stated_shortest=[list("aa"), list("bb"), list("cc")])

d3 = ["1","2","3"]
a = A("nfa", d3, [("q0",""),("q1","נקרא 2 שאולי לפני האחרון"),("q2","2 היה לפני האחרון")], "q0", ["q2"],
      [("q0",c,"q0") for c in d3] + [("q0","2","q1")] + [("q1",c,"q2") for c in d3])
fixture("nfa-slide34-second-last-2", "א״ס: האות לפני האחרונה היא 2", src(PDECK, "שקף 34", "verified-visual"), a,
        "מילים מעל {1,2,3} שבהן האות לפני האחרונה היא 2", lambda w: len(w) >= 2 and w[-2] == "2", 8,
        extra_words=[list("1221"), list("212"), list("2")], stated_shortest=[list("21"), list("22"), list("23")])

a = A("nfa", d3, [("q0",""),("q1","נקרא 2 שאולי לפני האחרון"),("q2","מסתיימת ב-22 או 21")], "q0", ["q2"],
      [("q0",c,"q0") for c in d3] + [("q0","2","q1"),("q1","2","q2"),("q1","1","q2")])
fixture("nfa-slide35-ends-22-or-21", "א״ס: מסתיימות ב-22 או ב-21", src(PDECK, "שקף 35", "verified-visual"), a,
        "מילים מעל {1,2,3} שמסתיימות ב-22 או ב-21", lambda w: J(w).endswith("22") or J(w).endswith("21"), 8,
        extra_words=[list("3221"), list("23")], stated_shortest=[list("21"), list("22")])

a = A("nfa", ab, [("q0","מילה ריקה"),("q1","רצף a בלבד"),("q2","מחכה ל-b של ab"),("q3","הסתיים ab")], "q0", ["q0","q1","q3"],
      [("q0","a","q1"),("q0","a","q2"),("q1","a","q1"),("q1","a","q2"),("q2","b","q3"),("q3","a","q2")])
def l36(w):
    x = J(w); i = 0
    while i < len(x) and x[i] == "a" and not x[i:].startswith("ab"): i += 1
    # a^n (ab)^m : try every split
    return any(x[:n] == "a"*n and (len(x)-n) % 2 == 0 and x[n:] == "ab"*((len(x)-n)//2) for n in range(len(x)+1))
fixture("nfa-slide36-an-abm", "א״ס: aⁿ(ab)ᵐ", src(PDECK, "שקף 36", "verified-visual",
        "בשקף: המילה הקצרה ε והבאה אחריה a"), a,
        "L = { aⁿ(ab)ᵐ | n,m ≥ 0 }", l36, 10,
        stated_runs=[([], True), (["a"], True)], extra_words=[list("ab"), list("aab"), list("abab"), list("aba"), list("ba")],
        stated_shortest=[[]])

# ================= synthetic: tree display edge cases & set merging =================
a = A("nfa", ["a"], [("q0","עוד לא קפצנו"),("q1","קפצנו")], "q0", ["q1"],
      [("q0","a","q0"),("q0","a","q1"),("q1","a","q1")])
fixture("synthetic-tree-limit", "עץ חישוב: בדיוק 16 עלים, ומעל 16 עם רוב מקבלים", src("סינתטי", "כלל צמצום העץ (סעיף 5.4)", "synthetic",
        "a^15: 16 עלים, מוצג במלואו. a^20: 21 עלים, 20 מקבלים, מוצגים 16 מקבלים ומוסתרים 5"), a,
        "מילים מעל {a} באורך 1 לפחות", lambda w: len(w) >= 1, 8,
        extra_words=[["a"]*15, ["a"]*20])
a = A("nfa", ab, [("q0","מחכה ל-b"),("qx","ענף ללא המשך ב-b"),("qf","נקרא b אחרי a-ים")], "q0", ["qf"],
      [("q0","a","q0"),("q0","a","qx"),("qx","a","qx"),("q0","b","qf")])
fixture("synthetic-tree-stuck-branches", "עץ חישוב: ענף מקבל יחיד בין ענפים שנתקעו, וענפים ללא מקבל",
        src("סינתטי", "כלל צמצום העץ + ענפים שנתקעו", "synthetic",
            "a^16 b: 17 עלים, 1 מקבל ו-16 נתקעו. a^17: 18 עלים, אף אחד לא מקבל"), a,
        "aⁿb, n ≥ 0", lambda w: len(w) >= 1 and w[-1] == "b" and all(c == "a" for c in w[:-1]), 8,
        extra_words=[["a"]*16 + ["b"], ["a"]*17, ["b", "a"]])
a = A("nfa", ab, [("q0",""),("q1","ענף עליון"),("q2","ענף תחתון"),("q3","שני הענפים התאחדו")], "q0", ["q3"],
      [("q0","a","q1"),("q0","a","q2"),("q1","b","q3"),("q2","b","q3")])
fixture("synthetic-set-merge", "איחוד ענפים בקבוצת המצבים", src("סינתטי", "קבוצת מצבים פעילים מול עץ", "synthetic",
        "במילה ab שני ענפים מגיעים ל-q3: בקבוצה q3 מופיע פעם אחת, בעץ יש שני עלים"), a,
        "המילה ab בלבד", lambda w: w == ["a","b"], 6, extra_words=[["a","b"], ["a"], ["a","b","a"]])

# ================= synthetic: dead state that is not a trap =================
a = A("dfa-full", ab, [("q0","עוד לא נקרא תו"),("q1","התחילה ב-a, אורך אי-זוגי"),("q2","התחילה ב-a, אורך זוגי"),
                       ("q3","התחילה ב-b")], "q0", ["q3"],
      table({"q0":["q1","q3"],"q1":["q2","q2"],"q2":["q1","q1"],"q3":["q3","q3"]}, ab))
fixture("synthetic-dead-not-trap", "מצבים מתים שאינם מלכודת", src("סינתטי", "סעיף 3.4: מלכודת מול מצב מת", "synthetic",
        "q1 ו-q2 מתים (אין מהם דרך למצב מקבל) אבל עוברים זה לזה, ולכן אינם מלכודת. q3 מקבל ואינו מלכודת"), a,
        "מילים שמתחילות ב-b", lambda w: len(w) > 0 and w[0] == "b", 8, extra_words=[list("ab"), list("b")], stated_traps=[])

json.dump({"fixtures": FIX}, open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("built", len(FIX), "fixtures in %.1fs" % (time.time() - T0))
