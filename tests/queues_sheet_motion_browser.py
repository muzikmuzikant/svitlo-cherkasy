"""Real Chromium regression for ALL QUEUES modal animations in production PWA.
Run against locally built _site. External network and Railway are blocked.
Covers mobile opening, closing, Escape, drag-down and accessibility opt-out.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

DIALOG = "#allQueuesDialog"

def state(page):
    return page.evaluate("""() => {
      const el=document.querySelector('#allQueuesDialog');
      const cs=getComputedStyle(el);
      const r=el.getBoundingClientRect();
      return {open:el.open,closing:el.classList.contains('is-leaving'),
        animation:cs.animationName,backdrop:getComputedStyle(el,'::backdrop').animationName,
        top:r.top,height:r.height,viewport:innerHeight};
    }""")

def opened(page):
    page.wait_for_function("""() => Boolean(window.SvitloAllQueues?.open &&
      window.SvitloAllQueuesSource?.dates)""",timeout=12000)
    return page.evaluate("""() => {
      window.SvitloAllQueues.open();
      const el=document.querySelector('#allQueuesDialog');
      return {open:el.open,animation:getComputedStyle(el).animationName,
        backdrop:getComputedStyle(el,'::backdrop').animationName};
    }""")

def ended(page):
    page.wait_for_function(
        "() => !document.querySelector('#allQueuesDialog').open", timeout=2500)

def exercise():
    with local_site() as base, sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            ctx=browser.new_context(viewport={"width":390,"height":844},
                is_mobile=True,has_touch=True,device_scale_factor=3,
                service_workers="block",reduced_motion="no-preference")
            ctx.add_init_script("""
              Object.defineProperty(navigator,'standalone',{
                configurable:true,get:()=>true
              });
              localStorage.setItem('svitlo-beta-analytics-choice','declined');
            """)
            ctx.route("https://**/*",lambda route:route.abort())
            page=ctx.new_page()
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.goto(base,wait_until="domcontentloaded",timeout=30000)
            ready(page)
            page.evaluate("document.documentElement.classList.remove('feature-off-animations','feature-off-panelMotion','feature-off-allQueuesSheetMotion')")
            result=opened(page)
            assert result["open"], result
            assert "allQueuesSheetEnter" in result["animation"],result
            assert "allQueuesBackdropEnter" in result["backdrop"],result
            page.wait_for_timeout(55)
            early=state(page)
            page.wait_for_timeout(560)
            stable=state(page)
            assert early["top"] > stable["top"]+140, (
                "Opening MUST visibly slide full screen: "+repr((early,stable)))
            assert abs(stable["top"]) < 12, stable
            print("PASS: modal slides from bottom on mobile and backdrop fades in")

            page.locator("#allQueuesClose").click()
            leaving=state(page)
            assert leaving["open"] and leaving["closing"], leaving
            assert "allQueuesSheetLeave" in leaving["animation"], leaving
            assert "allQueuesBackdropLeave" in leaving["backdrop"], leaving
            page.wait_for_timeout(160)
            falling=state(page)
            assert falling["top"] > stable["top"]+30, (
                "Closing MUST slide out, not disappear: "+repr((falling,stable)))
            ended(page)
            print("PASS: close button visibly slides whole sheet down before native close")

            result=opened(page)
            assert "allQueuesSheetEnter" in result["animation"],result
            page.wait_for_timeout(520)
            page.keyboard.press("Escape")
            leaving=state(page)
            assert leaving["closing"] and leaving["open"],leaving
            ended(page)
            print("PASS: Escape uses the same exit animation")

            opened(page)
            page.wait_for_timeout(560)
            gesture=page.evaluate("""() => {
              const handle=document.querySelector('#allQueuesDialog .sheet-handle');
              const r=handle.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
              const fire=(type,yy,active)=>{
                const t=new Touch({identifier:47,target:handle,clientX:x,clientY:yy});
                return handle.dispatchEvent(new TouchEvent(type,{
                  bubbles:true,cancelable:true,touches:active?[t]:[],
                  changedTouches:[t],targetTouches:active?[t]:[]
                }));
              };
              fire('touchstart',y,true);
              fire('touchmove',y+165,true);
              const moved=document.querySelector('#allQueuesDialog').style.transform;
              fire('touchend',y+165,false);
              return {moved,closing:document.querySelector('#allQueuesDialog').classList.contains('is-leaving')};
            }""")
            assert "translate3d" in gesture["moved"] or gesture["closing"], gesture
            assert gesture["closing"],gesture
            ended(page)
            print("PASS: drag-down dismisses with an exit animation")

            page.evaluate("document.documentElement.classList.add('feature-off-allQueuesSheetMotion')")
            out=opened(page)
            assert out["animation"] == "none", out
            page.locator("#allQueuesClose").click()
            assert not state(page)["open"], "Admin motion switch must disable animation"
            print("PASS: Admin Features switch actually disables modal animation")
            page.evaluate("document.documentElement.classList.remove('feature-off-allQueuesSheetMotion')")
            assert not errors, "Uncaught JS errors: "+repr(errors)
            ctx.close()
        finally:
            browser.close()

if __name__=="__main__":
    exercise()
