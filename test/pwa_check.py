"""Checks the installable, offline app in headless Chromium.
Serves dist/ under /trail-west-1848/ (the GitHub Pages path), then checks that Chrome sees
the app as installable, the service worker takes over, and the game and its font load offline.
Usage: python3 test/pwa_check.py   or   PW_CHANNEL=chrome python3 test/pwa_check.py   (needs Python Playwright + Chromium; the font check needs internet)
"""
import functools
import http.server
import os
import pathlib
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUBPATH = "trail-west-1848"
failures = []


def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        failures.append(what)


def serve():
    site = pathlib.Path(tempfile.mkdtemp())
    (site / SUBPATH).symlink_to(ROOT / "dist", target_is_directory=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/{SUBPATH}/"


def main():
    base = serve()
    errors = []
    with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
        # A persistent profile, because Chrome never offers installs in incognito.
        # PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's Chromium.
        ctx = p.chromium.launch_persistent_context(profile, headless=True, channel=os.environ.get("PW_CHANNEL"))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(base)

        page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
        check(True, "service worker controls the page")

        cdp = ctx.new_cdp_session(page)
        manifest = cdp.send("Page.getAppManifest")
        check(not manifest.get("errors"), f"manifest parses cleanly {manifest.get('errors') or ''}")
        installability = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
        check(not installability, f"Chrome sees the app as installable {[e['errorId'] for e in installability] or ''}")

        cached = page.evaluate("""async () => {
            const names = await caches.keys();
            const app = names.find((n) => n.startsWith('tw1848-') && n !== 'tw1848-fonts');
            const appKeys = app ? (await (await caches.open(app)).keys()).length : 0;
            for (let i = 0; i < 50; i++) {
                const fonts = (await (await caches.open('tw1848-fonts')).keys()).length;
                if (fonts >= 2) return { appKeys, fonts };
                await new Promise((r) => setTimeout(r, 200));
            }
            return { appKeys, fonts: 0 };
        }""")
        check(cached["appKeys"] >= 7, f"app files cached ({cached['appKeys']})")
        check(cached["fonts"] >= 2, f"font stylesheet and files cached ({cached['fonts']})")

        ctx.set_offline(True)
        for url in (base, base + "index.html"):
            page.goto(url)
            page.wait_for_function("document.getElementById('term').innerText.trim().length > 20", timeout=10000)
            check(True, f"game starts offline at {url[len(base) - len(SUBPATH) - 2:]}")
        font = page.evaluate("document.fonts.ready.then(() => document.fonts.check('20px VT323'))")
        check(font, "VT323 font loads offline")
        page.screenshot(path=str(ROOT / "test" / "out" / "pwa-offline.png"))
        ctx.close()

    check(not errors, f"no page or console errors {errors or ''}")
    print("errors:", len(failures))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    (ROOT / "test" / "out").mkdir(parents=True, exist_ok=True)
    main()
