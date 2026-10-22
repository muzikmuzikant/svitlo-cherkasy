"""Android-first Chromium PWA regression (touch, system Back, dark UI, narrow layouts).
Runs only against the locally built _site. Never contacts Railway or production.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

ANDROID_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Mobile Safari/537.36"
)
PAGES = ["feedback.html", "help.html", "privacy.html", "terms.html",
         "about.html", "advertising.html", "ad-detail.html", "support-project.html"]


def main():
    with local_site() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                user_agent=ANDROID_UA, viewport={"width": 390, "height": 844},
                device_scale_factor=2.75, is_mobile=True, has_touch=True,
                color_scheme="dark", service_workers="allow",
            )
            context.add_init_script("""() => {
              Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
              localStorage.setItem('svitlo-addresses-v6', JSON.stringify([{
                id:'android-test',settlement:'Черкаси',street:'Тестова',
                house:'1',queue:'1.1',favorite:false
              }]));
              localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'android-test'}));
              localStorage.setItem('svitlo-appearance-v1','dark');
              localStorage.setItem('svitlo-beta-analytics-choice','declined');
            }""")
            context.route("https://**/*", lambda route: route.abort())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base, wait_until="domcontentloaded")
            ready(page)
            assert page.evaluate("document.documentElement.dataset.theme") == "dark"
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2"), (
                "Android PWA horizontal overflow"
            )

            nav = lambda tab: page.locator('.bottom-nav [data-go="' + tab + '"]')
            nav("settings").click()
            page.wait_for_function("() => !document.querySelector('#settings').hidden")
            nav("updates").click()
            page.wait_for_function("() => !document.querySelector('#updates').hidden")
            page.evaluate("history.back()")
            page.wait_for_function("() => !document.querySelector('#settings').hidden", timeout=4000)
            print("PASS: Android Back returns to the prior tab")

            page.locator('#settings a[href^="./help.html"]').first.click()
            page.wait_for_function("""() => {
              const shell=document.querySelector('#svitloInternalPage');
              return shell&&!shell.hidden&&!shell.classList.contains('svitlo-internal-loading');
            }""", timeout=12000)
            frame_url=page.locator(".svitlo-internal-frame").evaluate(
                "(frame) => frame.contentWindow.location.href")
            assert "help.html" in frame_url, frame_url
            page.evaluate("history.back()")
            page.wait_for_function(
                "() => document.querySelector('#svitloInternalPage').hidden",
                timeout=5500,
            )
            assert page.locator("#settings").is_visible(), (
                "Android Back must close a help page before leaving Settings"
            )
            print("PASS: Android Back exits an internal help page")

            page.locator('#addFromSettings').click()
            page.wait_for_function("() => document.querySelector('#addressSheet').open")
            position = page.evaluate("""() => {
              const handle=document.querySelector('#addressSheet .sheet-handle');
              const box=handle.getBoundingClientRect();
              const x=box.left+box.width/2,y=box.top+box.height/2;
              const touch=(type,yy,active)=>{
                const t=new Touch({identifier:3,target:handle,clientX:x,clientY:yy});
                return handle.dispatchEvent(new TouchEvent(type,{
                 bubbles:true,cancelable:true,touches:active?[t]:[],
                 changedTouches:[t],targetTouches:active?[t]:[]
                }));
              };
              touch('touchstart',y,true);
              touch('touchmove',y+155,true);
              const dragged=getComputedStyle(document.querySelector('#addressSheet')).transform;
              touch('touchend',y+155,false);
              return dragged;
            }""")
            assert position != "none", "Sheet must follow Android touchscreen gesture"
            page.wait_for_function(
                "() => !document.querySelector('#addressSheet').open", timeout=2500)
            print("PASS: Android touch drags and dismisses the address sheet")

            # Check every public/embedded page for narrow screen overflow.
            mobile = browser.new_context(
                user_agent=ANDROID_UA, viewport={"width": 360, "height": 780},
                is_mobile=True, has_touch=True, color_scheme="dark",
            )
            mobile.route("https://**/*", lambda route: route.abort())
            for route in PAGES:
                candidate = mobile.new_page()
                candidate.goto(base+route, wait_until="domcontentloaded")
                candidate.wait_for_timeout(220)
                width=candidate.evaluate("""() => ({
                  page:document.documentElement.scrollWidth,
                  viewport:document.documentElement.clientWidth
                })""")
                assert width["page"] <= width["viewport"]+2, (
                    route+" Android 360px horizontal overflow: "+str(width)
                )
                candidate.close()
            print("PASS: eight secondary pages fit Android 360px viewport")

            # The installer is intentionally separate from the installed app.
            installer=browser.new_context(
                user_agent=ANDROID_UA, viewport={"width":360,"height":780},
                is_mobile=True, has_touch=True, color_scheme="dark",
            )
            installer.route("https://**/*", lambda route: route.abort())
            landing=installer.new_page()
            landing.goto(base, wait_until="domcontentloaded")
            landing.wait_for_function("() => !document.querySelector('#installLanding').hidden")
            dark=landing.locator(".install-panel").evaluate(
                "(n) => getComputedStyle(n).backgroundColor")
            assert dark != "rgb(255, 255, 255)", (
                "Android dark installer contains a white install panel"
            )
            landing.locator("#installAction").click()
            assert landing.locator("#installInstructions").is_visible()
            assert "Android" in landing.locator("#installInstructions").inner_text()
            print("PASS: Android dark installer and installation steps")
            assert not errors, "Uncaught Android shell errors: "+repr(errors)
            installer.close();mobile.close();context.close()
        finally:
            browser.close()


if __name__=="__main__":
    main()
