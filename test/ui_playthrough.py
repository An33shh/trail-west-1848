"""Drives the built page in headless Chromium through a full game.
Usage: python3 test/ui_playthrough.py [outdir] [seconds]
Fails on any page error or console error.
"""
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "test" / "out")
LIMIT = float(sys.argv[2]) if len(sys.argv) > 2 else 240
OUT.mkdir(parents=True, exist_ok=True)

errors = []


def click_text(page, text):
    loc = page.locator("button.btn", has_text=text).first
    if loc.count() and loc.is_enabled():
        loc.click()
        return True
    return False


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, name in [(760, "desktop"), (390, "phone")]:
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
        page.add_init_script("window.__TW_FAST = true; try{localStorage.clear()}catch(e){}")
        page.goto((ROOT / "dist" / "index.html").as_uri())
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / f"{name}-01-title.png"), full_page=True)
        if name == "phone":
            # Layout check only: no horizontal scroll.
            sw = page.evaluate("document.documentElement.scrollWidth")
            if sw > width:
                errors.append(f"horizontal overflow on phone: {sw}px")
            click_text(page, "Travel the trail")
            click_text(page, "Banker")
            page.screenshot(path=str(OUT / "phone-02-names.png"), full_page=True)
            click_text(page, "Next")
            click_text(page, "April")
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / "phone-03-store.png"), full_page=True)
            sw = page.evaluate("document.documentElement.scrollWidth")
            if sw > width:
                errors.append(f"horizontal overflow in store on phone: {sw}px")
            page.close()
            continue

        click_text(page, "Travel the trail")
        click_text(page, "Carpenter")
        click_text(page, "Next")
        click_text(page, "April")
        page.fill("#buy-oxen", "6")
        page.dispatch_event("#buy-oxen", "change")
        page.fill("#buy-food", "600")
        page.dispatch_event("#buy-food", "change")
        page.fill("#buy-clothing", "8")
        page.dispatch_event("#buy-clothing", "change")
        page.fill("#buy-bullets", "5")
        page.dispatch_event("#buy-bullets", "change")
        page.fill("#buy-axle", "1")
        page.dispatch_event("#buy-axle", "change")
        page.screenshot(path=str(OUT / "desktop-02-store.png"), full_page=True)
        click_text(page, "Leave for Oregon")

        shots = {"travel": False, "river": False, "fort": False, "hunt": False, "map": False}
        hunted = False
        start = time.time()
        while time.time() - start < LIMIT:
            page.wait_for_timeout(60)
            state = page.evaluate("window.__TW.G && {status: window.__TW.G.status, at: window.__TW.G.at, food: window.__TW.G.food, bullets: window.__TW.G.bullets, health: window.__TW.G.health, money: window.__TW.G.money, price: OT.prices(window.__TW.G).food}")
            if page.locator(".dialog").count():
                page.locator(".dialog button").first.click()
                continue
            if not state:
                break
            st = state["status"]
            if st in ("won", "dead"):
                page.wait_for_timeout(500)
                page.screenshot(path=str(OUT / f"desktop-09-{st}.png"), full_page=True)
                print("ending:", st)
                break
            if st == "travel" and page.locator("#stopbtn").count():
                if state["health"] >= 60:
                    page.locator("#stopbtn").click()
                    continue
                if not shots["travel"]:
                    page.wait_for_timeout(200)
                    page.screenshot(path=str(OUT / "desktop-03-travel.png"), full_page=True)
                    shots["travel"] = True
                continue
            if st == "river":
                if not shots["river"]:
                    page.screenshot(path=str(OUT / "desktop-04-river.png"), full_page=True)
                    shots["river"] = True
                if not (click_text(page, "Hire a Shoshone") or click_text(page, "Take the ferry")):
                    click_text(page, "Caulk the wagon")
                page.wait_for_timeout(3500)
                continue
            if st == "dalles":
                page.screenshot(path=str(OUT / "desktop-07-dalles.png"), full_page=True)
                click_text(page, "Raft down")
                click_text(page, "Push off")
                page.wait_for_timeout(1500)
                page.screenshot(path=str(OUT / "desktop-08-raft.png"), full_page=True)
                page.wait_for_timeout(41000)
                continue
            if page.locator("h2", has_text="Broken wagon").count():
                if not click_text(page, "Replace with a spare"):
                    click_text(page, "Try to repair")
                continue
            if not hunted and st in ("landmark", "fork") and state["bullets"] > 1 and state["at"] == "laramie":
                click_text(page, "Go hunting")
                page.wait_for_timeout(1200)
                # Fire at the middle of the field a few times.
                box = page.locator("#scene").bounding_box()
                for i in range(6):
                    page.mouse.click(box["x"] + box["width"] * (0.2 + i * 0.12), box["y"] + box["height"] * 0.8)
                    page.wait_for_timeout(150)
                page.screenshot(path=str(OUT / "desktop-06-hunt.png"), full_page=True)
                click_text(page, "Stop hunting")
                hunted = True
                continue
            if st == "landmark" and page.locator("button.btn", has_text="Buy supplies").count() and state["food"] < 400 and state["money"] > state["price"] * 20:
                if not shots["fort"]:
                    page.screenshot(path=str(OUT / "desktop-05-fort.png"), full_page=True)
                    click_text(page, "Look at map")
                    page.wait_for_timeout(200)
                    page.screenshot(path=str(OUT / "desktop-05b-map.png"), full_page=True)
                    click_text(page, "Back")
                    shots["fort"] = True
                click_text(page, "Buy supplies")
                page.fill("#buy-food", str(max(0, min(int(500 - state["food"]), int(state["money"] / state["price"]) - 1))))
                page.dispatch_event("#buy-food", "change")
                click_text(page, "Done")
                continue
            if st in ("landmark", "travel") and state["health"] >= 60 and page.locator("button.btn", has_text="Stop to rest").count():
                click_text(page, "Stop to rest")
                click_text(page, "3 days")
                continue
            if page.locator("h2", has_text="The trail divides").count():
                page.locator(".menu button").first.click()
                continue
            if not click_text(page, "Continue on the trail"):
                click_text(page, "Back") or click_text(page, "Done")
        else:
            page.screenshot(path=str(OUT / "desktop-timeout.png"), full_page=True)
            errors.append(f"timed out before the game ended: {state}")
        page.close()
    browser.close()

for e in errors:
    print("ERROR", e)
print("screenshots in", OUT)
sys.exit(1 if errors else 0)
