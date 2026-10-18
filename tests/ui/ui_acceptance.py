"""
UI acceptance checks (spec 11.1) that need a browser. Run against a built site:

    npm run build && npx vite preview --port 4173 &
    python3 tests/ui/ui_acceptance.py http://127.0.0.1:4173/

Prints one line per criterion and exits non-zero if any check fails.
"""
import asyncio, json, sys, tempfile, os
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/"
results = []

def check(ac, ok, detail=""):
    results.append((ac, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + ac + (f"  ({detail})" if detail else ""))

async def example(pg, title):
    await pg.click("header >> text=דוגמאות")
    await pg.click(f".examples button:has-text('{title}')")
    if await pg.locator("text=החלפה").count():
        await pg.click("text=החלפה")
    await pg.wait_for_timeout(150)

async def min_font(pg, scope):
    return await pg.evaluate("""(scope) => {
      let min = 1e9, where = '';
      for (const el of document.querySelectorAll(scope + ' *')) {
        if (!el.childNodes.length) continue;
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        let px = parseFloat(cs.fontSize);
        const svg = el.closest('svg');
        if (svg && svg.getScreenCTM()) px *= svg.getScreenCTM().a;
        if (px < min) { min = px; where = el.tagName + ':' + el.textContent.trim().slice(0, 20); }
      }
      return [min, where];
    }""", scope)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1366, "height": 768}, accept_downloads=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400)

        # AC-01: new automaton has one state and a start state; no F-02
        txt = await pg.inner_text("body")
        check("AC-01 new automaton has a start state", "F-02" not in txt)

        # AC-02: table edit updates graph and triples
        await example(pg, "מילים שמכילות את הרצף aa")
        await pg.select_option("select[aria-label='δ(q0, b)']", label="q1")
        labels = await pg.eval_on_selector_all(".g-edge text", "els => els.map(e => e.textContent)")
        await pg.click("button[role=tab]:has-text('שלשות')")
        triples = await pg.inner_text(".triples")
        check("AC-02 graph, table and triples are one model", "a,b" in labels and "(q0,b,q1)" in triples, f"labels={labels}")
        await pg.click("button[role=tab]:has-text('טבלת מעברים')")

        # AC-18: delete a state, transitions go, warning, undo restores
        before = await pg.locator(".g-edge").count()
        box = await pg.locator(".g-state", has_text="q1").first.locator("circle.body").bounding_box()
        await pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await pg.click("button:has-text('מחיקה')")
        toast = await pg.inner_text(".toast")
        after = await pg.locator(".g-edge").count()
        await pg.click("button[aria-label='ביטול']")
        restored = await pg.locator(".g-state").count()
        check("AC-18 delete state removes its transitions, can be undone", after < before and "נמחק" in toast and restored == 3, toast)

        # Editing where you click: toolbar next to the state, double-click = accepting, Delete key for arrows
        async def center(label):
            bb = await pg.locator(".g-state", has_text=label).first.locator("circle.body").bounding_box()
            return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        x, y = await center("q0"); await pg.mouse.click(x, y)
        bar = await pg.locator(".state-bar").count() == 1
        await pg.click(".state-bar button:has-text('מקבל')")
        acc_on = await pg.locator(".g-state", has_text="q0").first.locator("circle.ring").count() == 1
        x, y = await center("q0"); await pg.mouse.dblclick(x, y)
        acc_off = await pg.locator(".g-state", has_text="q0").first.locator("circle.ring").count() == 0
        n_states = await pg.locator(".g-state").count()
        edges0 = await pg.locator(".g-edge").count()
        await pg.locator(".g-edge text", has_text="a,b,c").first.click()
        await pg.keyboard.press("Delete")
        edges1 = await pg.locator(".g-edge").count()
        await pg.click("button[aria-label='ביטול']")
        check("Editing: state toolbar, double-click toggles accepting, Delete removes an arrow",
              bar and acc_on and acc_off and n_states == 3 and edges1 == edges0 - 1 and await pg.locator(".g-edge").count() == edges0,
              f"bar={bar} on={acc_on} off={acc_off} states={n_states} edges {edges0}->{edges1}")

        # AC-33 / AC-13: run locks editing; back restores; changing the word cancels the run
        await pg.click("header >> text=הרצה")
        editable = await pg.locator(".canvas-tools").count() + await pg.locator("table.delta select").count()
        await pg.fill("input[aria-label='המילה להרצה']", "abab")
        await pg.click("button:has-text('צעד קדימה')"); await pg.click("button:has-text('צעד קדימה')")
        p2 = await pg.inner_text(".pathline")
        await pg.click("button:has-text('צעד אחורה')")
        p1 = await pg.inner_text(".pathline")
        await pg.fill("input[aria-label='המילה להרצה']", "abb")
        prog = await pg.inner_text("text=/נקראו \\d+ מתוך/")
        check("AC-33 editing locked while running; changing the word resets", editable == 0 and "נקראו 0" in prog, prog)
        check("AC-13 step back restores the previous configuration", p1.count("->") == 1 and p2.count("->") == 2, f"{p1} | {p2}")

        # regression: after a run reaches the end, a new word runs again
        await pg.fill("input[aria-label='המילה להרצה']", "aa")
        await pg.click("button:has-text('לסוף')")
        await pg.fill("input[aria-label='המילה להרצה']", "baa")
        enabled = await pg.locator("button:has-text('צעד קדימה')").is_enabled()
        await pg.click("button:has-text('צעד קדימה')")
        check("A second word runs after the first one finished", enabled and "נקראו 1" in await pg.inner_text("text=/נקראו/"))

        # AC-26: readable sizes at 1366x768
        mf, where = await min_font(pg, ".app")
        check("AC-26 all text at least 14px (run screen)", mf >= 13.95, f"min {mf:.1f}px at {where}")
        await pg.click("header >> text=בנייה")
        mf, where = await min_font(pg, ".app")
        check("AC-26 all text at least 14px (build screen)", mf >= 13.95, f"min {mf:.1f}px at {where}")

        # AC-38: presentation mode
        await pg.click("header >> text=הרצה")
        await pg.fill("input[aria-label='המילה להרצה']", "aab")
        await pg.click("text=מצב הצגה")
        await pg.wait_for_timeout(400)
        side = await pg.locator(".present .side, .present table.delta, .present .card").count()
        f = await pg.evaluate("""() => { const svg = document.querySelector('.present svg'); const k = svg.getScreenCTM().a;
            const sizes = [...svg.querySelectorAll('.g-state text, .g-edge text')].map(t => parseFloat(getComputedStyle(t).fontSize) * k);
            return Math.min(...sizes); }""")
        await pg.click(".present button:has-text('צעד קדימה')")
        stepped = "נקראו 1" in await pg.inner_text(".present")
        await pg.keyboard.press("Escape")
        gone = await pg.locator(".present").count() == 0
        still_run = await pg.locator("input[aria-label='המילה להרצה']").input_value() == "aab"
        check("AC-38 presentation: no side panel/table/tools, names >= 28px, controls work, Esc restores", side == 0 and f >= 28 and stepped and gone and still_run, f"min label {f:.1f}px")

        # AC-25: SVG export keeps start arrow, double circle, trap fill
        await pg.click("header >> text=בנייה")
        await example(pg, "תרגיל 14")
        async with pg.expect_download() as dl:
            await pg.click("summary:has-text('ייצוא ציור')"); await pg.click(".menu button:has-text('SVG')")
        d = await dl.value
        svg = open(await d.path(), encoding="utf-8").read()
        check("AC-25 SVG export keeps start, accepting and trap marks", 'class="g-start"' in svg and 'class="ring"' in svg and "#E2E6EC" in svg and 'trap' in svg)
        async with pg.expect_download() as dl2:
            await pg.click("summary:has-text('ייצוא ציור')"); await pg.click(".menu button:has-text('PNG')")
        d2 = await dl2.value
        check("AC-25 PNG export", (await d2.path()) and os.path.getsize(await d2.path()) > 2000)

        # AC-24: saving an invalid automaton warns; reload shows the same errors
        await pg.select_option("select[aria-label='δ(q0, a)']", "")
        async with pg.expect_download() as dl3:
            await pg.click("text=שמירה לקובץ")
        saved = await (await dl3.value).path()
        warn = await pg.inner_text(".toast")
        check("AC-24 invalid automaton saves with a warning", "נשמר עם" in warn, warn)

        # AC-17: a broken file is rejected and the open work stays
        bad = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False); bad.write("{ broken"); bad.close()
        title_before = await pg.input_value("input[aria-label='שם האוטומט']")
        await pg.set_input_files("input[type=file]", bad.name)
        await pg.wait_for_timeout(200)
        msg = await pg.inner_text(".toast")
        check("AC-17 broken file rejected, open work unchanged", "פגום" in msg and await pg.input_value("input[aria-label='שם האוטומט']") == title_before, msg)
        # and the saved invalid file reloads with its errors
        await pg.set_input_files("input[type=file]", saved)
        await pg.wait_for_timeout(200)
        if await pg.locator("text=החלפה").count(): await pg.click("text=החלפה")
        check("AC-24 reloaded file shows the same errors", "F-03" in await pg.inner_text(".side"))

        # AC-32: draft restore after reload, delete draft, no silent overwrite
        await pg.reload(); await pg.wait_for_timeout(300)
        offered = await pg.locator("text=נמצאה טיוטה").count() > 0
        await pg.click("text=התחלה מחדש")
        await pg.reload(); await pg.wait_for_timeout(300)
        blank_no_dialog = await pg.locator("text=נמצאה טיוטה").count() == 0
        # a new blank automaton was autosaved; edit it so there is a draft, then reload and restore
        await pg.fill("input[aria-label='שם האוטומט']", "טיוטה לבדיקה")
        await pg.reload(); await pg.wait_for_timeout(300)
        await pg.click("text=שחזור הטיוטה")
        restored_title = await pg.input_value("input[aria-label='שם האוטומט']")
        check("AC-32 draft offered after reload, can be deleted or restored", offered and blank_no_dialog and restored_title == "טיוטה לבדיקה", f"offered={offered} deleted={blank_no_dialog} restored={restored_title}")

        # AC-29 / AC-37: task in the file; student sees only chosen tools; locked blocks editing; test words marked
        task = {"schemaVersion": 1, "type": "dfa-full", "title": "משימה", "alphabet": ["a", "b"],
                "states": [{"id": "s0", "label": "q0", "x": 100, "y": 100, "memory": "x"}, {"id": "s1", "label": "q1", "x": 260, "y": 100, "memory": "y"}],
                "initialStateId": "s0", "acceptingStateIds": ["s1"],
                "transitions": [{"id": "t0", "from": "s0", "symbol": "a", "to": "s1"}, {"id": "t1", "from": "s0", "symbol": "b", "to": "s0"},
                                {"id": "t2", "from": "s1", "symbol": "a", "to": "s1"}, {"id": "t3", "from": "s1", "symbol": "b", "to": "s1"}],
                "testWords": [{"word": ["a"], "expected": True}, {"word": ["b", "a"], "expected": False}],
                "task": {"prompt": "מעקב", "kind": "trace", "tools": ["T-1", "T-8"], "locked": True}}
        tf = tempfile.NamedTemporaryFile("w", suffix=".automaton.json", delete=False, encoding="utf-8"); json.dump(task, tf, ensure_ascii=False); tf.close()
        await pg.set_input_files("input[type=file]", tf.name)
        await pg.wait_for_timeout(200)
        if await pg.locator("text=החלפה").count(): await pg.click("text=החלפה")
        tools = await pg.eval_on_selector_all(".side .card button .mono", "els => els.map(e => e.textContent)")
        locked = await pg.locator(".canvas-tools").count() == 0 and await pg.locator("table.delta select").count() == 0
        await pg.click("text=הרצת כל המילים")
        tw = await pg.inner_text(".side")
        check("AC-29 student sees only the chosen tools and a locked automaton", tools == ["T-1", "T-8"] and locked, f"tools={tools}")
        check("AC-37 test words: wrong ones explained, right ones marked", "1 מתוך 2" in tw and "האוטומט שלך מקבל את ba, אבל היא לא בשפה." in tw)
        await pg.click("text=מצב מורה")
        await pg.click("header >> text=בנייה")
        free_tools = await pg.eval_on_selector_all(".side .card button .mono", "els => els.map(e => e.textContent)")
        check("AC-29 teacher / free work: all tools open", len(free_tools) == 8, f"{free_tools}")

        # 150% zoom: usable, no horizontal scroll
        z = await b.new_page(viewport={"width": 911, "height": 512}, device_scale_factor=1.5)
        await z.goto(URL); await z.wait_for_timeout(300)
        if await z.locator("text=התחלה מחדש").count(): await z.click("text=התחלה מחדש")
        over = await z.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check("AC-26 usable at 150% zoom (no horizontal scroll)", over <= 0, f"overflow {over}px")

        check("no page errors", not errors, "; ".join(errors))
        await b.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
