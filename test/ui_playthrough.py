"""Plays the built green-screen game end to end in headless Chromium by reading
the terminal and typing answers. Fails on page errors, console errors, or a stall.
Usage: python3 test/ui_playthrough.py [outdir] [seconds]
"""
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "test" / "out")
LIMIT = float(sys.argv[2]) if len(sys.argv) > 2 else 400
OUT.mkdir(parents=True, exist_ok=True)
errors = []
shots = set()


def snap(page, name):
    if name not in shots:
        shots.add(name)
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def play(page, occupation="2"):
    opening_plan = [("1", "3"), ("2", "700"), ("3", "10"), ("4", "6"), ("6", "1"), ("5", "1")]
    plan_i = 0
    fort_bought = False
    last_text, same_since = "", time.time()
    start = time.time()
    while time.time() - start < LIMIT:
        page.wait_for_timeout(40)
        text = page.inner_text("#term")
        g = page.evaluate("window.__TW.G && {status: window.__TW.G.status, food: window.__TW.G.food, health: window.__TW.G.health, money: window.__TW.G.money, at: window.__TW.G.at, bullets: window.__TW.G.bullets}")
        if text != last_text:
            last_text, same_since = text, time.time()
        elif time.time() - same_since > 60:
            snap(page, "stall")
            errors.append("stalled on: " + text[-300:])
            return
        if "Congratulations" in text:
            snap(page, "10-won-intro")
        if "POINTS FOR ARRIVING" in text:
            snap(page, "11-score")
            return "won"
        if "HERE LIES" in text and page.locator("#term-input").count():
            snap(page, "10-tombstone")
            page.fill("#term-input", "GONE WEST")
            page.press("#term-input", "Enter")
            return "dead"
        if text.startswith("HUNTING"):
            snap(page, "07-hunt")
            box = page.locator("#scene").bounding_box()
            for i in range(5):
                page.mouse.click(box["x"] + box["width"] * (0.15 + i * 0.17), box["y"] + box["height"] * 0.82)
                page.wait_for_timeout(120)
            page.keyboard.press("Enter")
            continue
        if text.startswith("THE COLUMBIA RIVER"):
            snap(page, "09-raft")
            continue
        if "Press ENTER to size up" in text:
            snap(page, "03-travel")
            if g and g["health"] >= 60:
                page.keyboard.press("Enter")
            continue
        has_input = page.locator("#term-input").count() > 0
        if not has_input:
            if "Press ENTER" in text or "Press ENTER" in text.split("\n")[-1]:
                page.keyboard.press("Enter")
            continue
        prompt = page.locator(".prompt span").first.inner_text()

        def answer(v):
            page.fill("#term-input", v, timeout=5000)
            page.press("#term-input", "Enter")

        if prompt.startswith("Name of the wagon leader") or re.match(r"\s+\d\. $", prompt):
            answer("")
        elif "(Y/N)" in prompt:
            answer("Y" if "names correct" in prompt else "N")
        elif prompt.startswith("> "):
            word = re.search(r"TYPE (\w+)", text).group(1)
            snap(page, "06-riders")
            answer(word)
        elif "Which item" in prompt:
            if "HIRAM" in text:
                snap(page, "02-store")
                if plan_i < len(opening_plan):
                    answer(opening_plan[plan_i][0])
                else:
                    answer("8")
            else:
                snap(page, "05-fort-store")
                if not fort_bought:
                    fort_bought = True
                    answer("2")
                else:
                    answer("8")
        elif prompt.startswith("How many days"):
            answer("3")
        elif prompt.startswith("How many"):
            if "HIRAM" not in text and plan_i >= len(opening_plan):
                afford = int(g["money"] / OT_food_price(page)) - 1
                answer(str(max(0, min(500 - int(g["food"]), afford))))
            else:
                answer(opening_plan[plan_i][1])
                plan_i += 1
        elif prompt.startswith("Your epitaph"):
            answer("GONE WEST")
        elif prompt.startswith("What is your choice"):
            if "Many kinds of people" in text:
                answer(occupation)
            elif "which month" in text:
                answer("2")
            elif "THE TRAIL WEST" in text or "Travel the trail" in text:
                snap(page, "01-title")
                answer("1")
            elif "You must cross the river" in text:
                snap(page, "04-river")
                if "Shoshone guide" in text:
                    answer("4")
                elif "take a ferry" in text and g["money"] >= 5:
                    answer("3")
                else:
                    answer("2")
            elif "The trail divides" in text and "Columbia" in text:
                snap(page, "08-dalles")
                answer("1")
            elif "The trail divides" in text:
                answer("1")
            elif "Broken wagon" in text:
                answer("2" if re.search(r"You have [1-9]", text) else "1")
            elif "Buy supplies" in text and g["food"] < 400 and g["money"] > 30:
                fort_bought = False
                answer("11")
            elif "You may:" in text and g and g["health"] >= 60:
                answer("6")
            elif "You may:" in text:
                if g and g["food"] < 80 and g["bullets"] > 1:
                    answer("8")
                else:
                    answer("1")
            else:
                answer("1")
        else:
            answer("")
    errors.append("timed out")
    snap(page, "timeout")


def OT_food_price(page):
    return page.evaluate("OT.prices(window.__TW.G).food")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 800, "height": 1000})
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
    page.add_init_script("window.__TW_FAST = true; try{localStorage.clear()}catch(e){}")
    page.goto((ROOT / "dist" / "index.html").as_uri())
    page.wait_for_timeout(500)
    try:
        result = play(page, sys.argv[3] if len(sys.argv) > 3 else "2")
    except Exception as e:  # report where it broke
        page.screenshot(path=str(OUT / "crash.png"), full_page=True)
        errors.append(f"driver crash: {str(e).splitlines()[0]} | screen: {page.inner_text('#term')[-400:]!r}")
        result = None
    print("ending:", result)
    page.close()

    # Phone width: title and store must not scroll sideways.
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page.on("pageerror", lambda e: errors.append(f"phone pageerror: {e}"))
    page.add_init_script("window.__TW_FAST = true; try{localStorage.clear()}catch(e){}")
    page.goto((ROOT / "dist" / "index.html").as_uri())
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "phone-01-title.png"), full_page=True)
    page.locator(".opt", has_text="Travel the trail").first.tap()
    page.wait_for_timeout(200)
    page.locator(".opt", has_text="carpenter").first.tap()
    page.wait_for_timeout(200)
    for _ in range(5):
        page.press("#term-input", "Enter")
    page.fill("#term-input", "Y"); page.press("#term-input", "Enter")
    page.locator(".opt", has_text="April").first.tap()
    page.wait_for_timeout(200)
    page.locator(".opt").first.tap()
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "phone-02-store.png"), full_page=True)
    sw = page.evaluate("document.documentElement.scrollWidth")
    if sw > 390:
        errors.append(f"phone horizontal overflow {sw}px")
    browser.close()

for e in errors:
    print("ERROR", e)
print("screenshots in", OUT)
sys.exit(1 if errors else 0)
