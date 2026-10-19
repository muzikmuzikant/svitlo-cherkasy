"""Browser-level regression: a previously installed PWA must open without Internet.

Runs against a local release build. No production deployment or Push requests.
The standalone flag is simulated in Chromium; iPhone Safari still needs a
separate device test after the update is installed while online.
"""
from __future__ import annotations
import contextlib
import functools
import http.server
import json
from pathlib import Path
import threading
import traceback

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "_site"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def log_message(self, *_args):
        pass


@contextlib.contextmanager
def local_site():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=3)


def ready(page):
    page.wait_for_function(
        "() => document.querySelector('#appBootScreen')?.hidden === true",
        timeout=30000,
    )
    assert page.locator("#home").is_visible(), "The home screen did not open"


def test_offline_cold_restart():
    assert (SITE / "index.html").is_file(), "First build the _site directory"
    with local_site() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(service_workers="allow")
            # Chromium does not provide an iPhone standalone display mode. This
            # explicitly exercises the installed-PWA branch of install.js.
            context.add_init_script("""
                Object.defineProperty(navigator, 'standalone', {
                    configurable: true, get: () => true
                });
            """)
            # Never talk to Railway, the production website, or any other
            # external provider during this regression.
            context.route("https://**/*", lambda route: route.abort())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base, wait_until="domcontentloaded", timeout=30000)
            ready(page)
            page.wait_for_function(
                "() => Boolean(navigator.serviceWorker?.controller)",
                timeout=30000,
            )
            # A full online visit seeds an address and cached schedule before
            # the user disconnects and closes the installed app.
            page.evaluate("""() => {
              localStorage.setItem('svitlo-addresses-v6', JSON.stringify([{
                id: 'offline-test', settlement: 'Черкаси',
                street: 'Тестова', house: '1', queue: '1.1',
                favorite: false
              }]));
              localStorage.setItem('svitlo-prefs-v6',
                JSON.stringify({primaryId: 'offline-test'}));
            }""")
            cache = page.evaluate("""async () => {
              const keys = (await caches.keys())
                .filter(k => k.startsWith('svitlo-cherkasy-shell-v'));
              if (!keys.length) return {keys, missing:['NO_SHELL_CACHE']};
              const c = await caches.open(keys[keys.length-1]);
              const origin = location.origin;
              const required=['/','/index.html','/app.js','/style.css',
                '/install.js','/hour-paint.js','/address-lookup.js',
                '/data-merge.js','/notification-center.js'];
              const missing=[];
              for(const file of required){
                if(!(await c.match(origin+file)))missing.push(file);
              }
              return {keys, missing};
            }""")
            assert not cache["missing"], f"Missing offline bootstrap: {cache}"
            # Simulate airplane mode, then close and reopen the PWA window.
            context.set_offline(True)
            page.close()
            offline = context.new_page()
            offline_errors = []
            offline.on("pageerror", lambda error: offline_errors.append(str(error)))
            offline.goto(base+"?source=offline-relaunch",
                         wait_until="domcontentloaded", timeout=20000)
            ready(offline)
            assert offline.locator("#offlineChip").is_visible(), (
                "The app must tell the user it is displaying offline data"
            )
            # Day strip remains functional even when a date has no schedule.
            offline.evaluate("""() =>
              document.querySelector('[data-go="detail"]')?.click()
            """)
            offline.wait_for_function(
                "() => !document.querySelector('#detail').hidden", timeout=5000,
            )
            assert offline.locator("#days .day-choice").count() == 7, (
                "Offline schedule view must still contain all 7 weekdays"
            )
            assert not offline_errors, (
                "Uncaught JavaScript errors offline: " + repr(offline_errors)
            )
            print("PASS: installed shell boots offline, seven days work, offline state shown")
            offline.close()
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    test_offline_cold_restart()
