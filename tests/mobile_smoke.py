"""Optional visual/layout smoke checks: python tests/mobile_smoke.py.
Requires: pip install playwright and a working Chromium installation.
Tests DOM and CSS without networking to the electricity provider.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = [(320, 568), (375, 812), (390, 844), (430, 932), (768, 1024)]


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            for width, height in WIDTHS:
                page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
                page.set_content((ROOT / "index.html").read_text(encoding="utf-8"))
                page.add_style_tag(content=(ROOT / "style.css").read_text(encoding="utf-8"))
                page.add_script_tag(content=(ROOT / "app.js").read_text(encoding="utf-8"))
                sizes = page.evaluate("""() => ({
                    scroll: document.documentElement.scrollWidth,
                    viewport: innerWidth
                })""")
                assert sizes["scroll"] <= sizes["viewport"] + 1, (width, sizes)
                page.locator("#addAddress").click()
                assert page.locator("#editDialog").evaluate("e => e.open")
                assert page.evaluate("document.body.classList.contains('modal-locked')")
                assert float(page.locator("#street").evaluate("e => getComputedStyle(e).fontSize").replace("px", "")) >= 16
                page.locator("#street").fill("Благовісна")
                page.locator("#house").fill("244")
                assert page.locator("#openOfficialLookup").is_visible()
                page.locator("#closeDialog").click()
                page.wait_for_function("!document.body.classList.contains('modal-locked')")
                print(f"PASS {width}×{height}")
                page.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
