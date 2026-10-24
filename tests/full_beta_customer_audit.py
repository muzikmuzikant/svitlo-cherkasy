"""Full public Beta navigation and rendering audit.

All requests to external services are blocked. Local fake addresses only.
No real requests, logins, push sends, private receipts, or Railway writes.
This is a broad browser smoke, not a substitute for Safari and live API QA.
"""
from __future__ import annotations
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

PAGES = [
    "about.html","ad-detail.html","advertising.html","feedback.html",
    "help.html","privacy.html","support-project.html","terms.html",
]
MAIN_TABS = ("home", "detail", "updates", "settings")
DEVICES = [(320,680),(360,780),(390,844),(768,1024),(1280,900)]
REPORT = Path(__file__).resolve().parents[1] / "beta-audit-report.json"

def check_document(page, tag: str, width: int) -> dict:
    data = page.evaluate("""() => {
      const doc=document.documentElement,body=document.body;
      const seen=[...document.querySelectorAll('button,input,select,textarea,a')];
      const hidden=x=>x.closest('[hidden],[aria-hidden="true"]')!==null ||
        getComputedStyle(x).display==='none'||getComputedStyle(x).visibility==='hidden';
      const blank=seen.filter(x=>!hidden(x) && x.getBoundingClientRect().width>=8 &&
        !((x.getAttribute('aria-label')||x.getAttribute('title')||x.innerText||x.value||'').trim()) &&
        !((x.id||'') && document.querySelector('label[for="'+x.id+'"]')));
      return {
        scroll:doc.scrollWidth, viewport:doc.clientWidth,
        bodyWidth:body.scrollWidth, innerWidth:innerWidth,
        theme:doc.dataset.theme||'',
        title:document.title,
        buttons:seen.length,
        unnamed:blank.slice(0,8).map(x=>x.outerHTML.slice(0,160)),
        #NOOP#
      };
    }""".replace("#NOOP#", ""))
    if data["scroll"] > width + 3:
        raise AssertionError(f"{tag}: horizontal root overflow {data}")
    if not data["title"].strip():
        raise AssertionError(f"{tag}: document has no title")
    if data["buttons"] < 1:
        raise AssertionError(f"{tag}: unexpectedly no interactions found")
    return data

def main():
    reports=[]
    with local_site() as base, sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for theme in ("light","dark"):
                for width,height in DEVICES:
                    context=browser.new_context(
                        viewport={"width":width,"height":height},
                        device_scale_factor=2 if width<=390 else 1,
                        color_scheme=theme,service_workers="block"
                    )
                    context.add_init_script("""(()=>{
                       localStorage.setItem('svitlo-appearance-v1','__THEME__');
                       localStorage.setItem('svitlo-beta-analytics-choice','declined');
                       localStorage.setItem('svitlo-beta-analytics-opt-in','no');
                    })();""".replace('__THEME__',theme))
                    context.route("https://**/*", lambda r: r.abort())
                    for pathname in PAGES:
                        page=context.new_page()
                        errors=[]
                        page.on("pageerror",lambda exc: errors.append(str(exc)))
                        page.goto(base+pathname,wait_until="domcontentloaded",timeout=30000)
                        page.wait_for_timeout(125)
                        report=check_document(page,theme+"/"+pathname,width)
                        reports.append({"page":pathname,"theme":theme,"width":width,**report})
                        if errors:
                            raise AssertionError(f"{theme} {pathname} {width}: JS errors: {errors}")
                        page.close()
                    context.close()
                    print(f"PASS: {theme} {width}px all {len(PAGES)} standalone customer pages",flush=True)

            # The installed PWA: every bottom navigation tab in both color schemes
            # at three sizes, plus real address sheet, support route and inbox.
            for theme in ("light","dark"):
                for width,height in [(320,680),(390,844),(768,1024),(1280,900)]:
                    context=browser.new_context(
                        viewport={"width":width,"height":height},
                        color_scheme=theme,
                        service_workers="block",
                        has_touch=width<=390,
                    )
                    context.add_init_script("""(()=>{
                      Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
                      localStorage.setItem('svitlo-appearance-v1','__THEME__');
                      localStorage.setItem('svitlo-beta-analytics-choice','declined');
                      localStorage.setItem('svitlo-beta-analytics-opt-in','no');
                      localStorage.setItem('svitlo-addresses-v6',JSON.stringify([{
                        id:'fake-audit-address',settlement:'Черкаси',street:'Тестова',
                        house:'1',queue:'1.1',favorite:false
                      }]));
                      localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'fake-audit-address'}));
                    })();""".replace('__THEME__',theme))
                    context.route("https://**/*",lambda r:r.abort())
                    page=context.new_page()
                    errors=[]
                    page.on("pageerror",lambda exc:errors.append(str(exc)))
                    page.goto(base,wait_until="domcontentloaded")
                    ready(page)
                    for tab in MAIN_TABS:
                        page.locator('.bottom-nav [data-go="'+tab+'"]').first.click()
                        page.wait_for_function("(tab) => document.querySelector('#'+tab)?.hidden===false",arg=tab,timeout=6000)
                        page.wait_for_timeout(115)
                        report=check_document(page,theme+"/app/"+tab,width)
                        reports.append({"page":"app/"+tab,"theme":theme,"width":width,**report})
                    page.locator('[data-go="settings"]').first.click()
                    page.locator('#settingsNavHub [data-settings-page="places"]').click()
                    page.locator("#addFromSettings").click()
                    page.wait_for_function("() => document.querySelector('#addressSheet')?.open",timeout=4500)
                    sheet=page.locator("#addressSheet").bounding_box()
                    assert sheet and sheet["width"]<=width+3,(theme,width,sheet)
                    page.locator("#closeAddress").click() if page.locator("#closeAddress").count() else page.keyboard.press("Escape")
                    page.wait_for_function("() => !document.querySelector('#addressSheet')?.open",timeout=6000)
                    if errors:
                        raise AssertionError(f"{theme} app {width}: JS errors {errors}")
                    print(f"PASS: {theme} {width}px all 4 PWA tabs and address sheet",flush=True)
                    context.close()

            # Standalone-install landing remains functional in ordinary browsers.
            for width,height in [(320,680),(390,844),(1280,900)]:
                context=browser.new_context(viewport={"width":width,"height":height},service_workers="block")
                context.route("https://**/*",lambda r:r.abort())
                page=context.new_page()
                errors=[]
                page.on("pageerror",lambda exc:errors.append(str(exc)))
                page.goto(base,wait_until="domcontentloaded")
                page.wait_for_function("() => document.querySelector('#installLanding')?.hidden===false")
                reports.append({"page":"install","theme":"light","width":width,
                                **check_document(page,"install",width)})
                if errors:raise AssertionError(f"Installer errors {errors}")
                context.close()

            # Office login is part of the same beta site but never receives real
            # credentials; authenticated scenarios are audited in admin_office_browser.py.
            for width in (320,390,1280):
                context=browser.new_context(viewport={"width":width,"height":844},
                                             service_workers="block")
                context.route("https://**/*",lambda r:r.abort())
                page=context.new_page()
                errors=[]
                page.on("pageerror",lambda exc:errors.append(str(exc)))
                page.goto(base+"admin.html",wait_until="domcontentloaded")
                reports.append({"page":"admin-login","theme":"light","width":width,
                                **check_document(page,"admin-login",width)})
                assert page.locator("#adminLoginScreen").is_visible()
                if errors:raise AssertionError(f"Admin login JS errors {errors}")
                context.close()
        finally:
            browser.close()
    REPORT.write_text(json.dumps(reports,indent=2,ensure_ascii=False),encoding="utf-8")
    print(f"PASS: full beta public audit: {len(reports)} page/theme/viewport combinations",flush=True)

if __name__ == "__main__":
    main()
