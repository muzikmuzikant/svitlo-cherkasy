"""PWA internal pages must never turn into a nested app landing on iOS.
Run with `python scripts/build_pages.py` and Playwright Chromium installed.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

PAGES={
    "feedback.html":"Центр підтримки",
    "help.html":"Допомога",
    "privacy.html":"Конфіденційність",
    "terms.html":"Умови",
    "about.html":"Світло Черкаси",
    "advertising.html":"Реклама",
    "support-project.html":"Підтримати",
    "ad-detail.html":"Рекламне оголошення",
}

def assert_internal(page,target):
    page.evaluate("(path) => window.SvitloInternalPages.open('./'+path)",target)
    page.wait_for_function("""() => document.querySelector('#svitloInternalPage')
       && !document.querySelector('#svitloInternalPage').hidden
       && !document.querySelector('#svitloInternalPage').classList.contains('svitlo-internal-loading')""",timeout=12000)
    frame=page.frame_locator(".svitlo-internal-frame")
    assert frame.locator("body").is_visible(),target+" did not load visible content"
    url=page.locator(".svitlo-internal-frame").get_attribute("src") or ""
    assert target in url,(target,url)
    # Every subsidiary page is a standalone document, not our main app shell.
    assert frame.locator("#appBootScreen").count()==0, target+" returned the app index instead of its page"
    assert frame.locator("#svitloInternalOffline").count()==0, target+" returned an unavailable-page fallback"
    assert page.locator(".svitlo-internal-error").is_hidden(),target+" unexpectedly displayed an error"
    assert frame.locator("body").inner_text().strip(),target+" returned an empty page"
    page.locator(".svitlo-internal-back").click()
    page.wait_for_function("() => document.querySelector('#svitloInternalPage').hidden",timeout=5000)

def main():
    with local_site() as base,sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        context=browser.new_context(service_workers="allow",viewport={"width":390,"height":844})
        context.add_init_script("""Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
          localStorage.setItem('svitlo-beta-analytics-choice','declined');
          localStorage.setItem('svitlo-beta-analytics-opt-in','no');""")
        context.route("https://**/*",lambda route:route.abort())
        try:
            page=context.new_page()
            page.goto(base,wait_until="domcontentloaded")
            ready(page)
            page.wait_for_function("() => !!navigator.serviceWorker.controller",timeout=30000)
            # Offline test must run BEFORE visiting any subsidiary page: otherwise
            # it accidentally passes just because navigation cached the files.
            context.set_offline(True)
            for page_name in PAGES: assert_internal(page,page_name)
            print("PASS: all 8 internal pages opened from the installed PWA shell offline")
            context.set_offline(False)
            for page_name in PAGES: assert_internal(page,page_name)
            print("PASS: all 8 internal pages opened on an installed PWA online")
            # Open the actual Settings links as an end user would, rather than
            # testing the programmatic helper alone.
            page.locator('.bottom-nav [data-go="settings"]').click()
            for link,target in [
                ('#settings a[href^="./help.html"]','help.html'),
                ('#settings a[href^="./feedback.html"]','feedback.html'),
            ]:
                page.locator(link).first.click()
                page.wait_for_function("""() => !document.querySelector('#svitloInternalPage').hidden
                    && !document.querySelector('#svitloInternalPage').classList.contains('svitlo-internal-loading')""",timeout=12000)
                assert target in page.locator('.svitlo-internal-frame').get_attribute('src')
                assert page.frame_locator('.svitlo-internal-frame').locator('#appBootScreen,#svitloInternalOffline').count()==0
                page.locator('.svitlo-internal-back').click()
                page.wait_for_function("() => document.querySelector('#svitloInternalPage').hidden",timeout=5000)
            print("PASS: real help and support links work from Settings")
        finally:
            browser.close()

if __name__=="__main__":
    main()
