"""Beta 7.9.13 visual stability regression. Uses only local _site and fake saved address.
Chromium is not iOS Safari; device QA remains a separate release gate.
"""
from __future__ import annotations
import json
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

PAGES=("feedback.html","help.html","privacy.html","terms.html","about.html",
       "advertising.html","ad-detail.html","support-project.html")
BOOT="""Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
 localStorage.setItem('svitlo-addresses-v6',JSON.stringify([{
   id:'visual-test',settlement:'Черкаси',street:'Тестова',house:'1',queue:'1.1',favorite:false
 }]));
 localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'visual-test'}));
 localStorage.setItem('svitlo-beta-analytics-choice','declined');
 localStorage.setItem('svitlo-beta-analytics-opt-in','no');
"""

def inspect(page):
    return page.evaluate("""() => {
      const w=window.innerWidth,doc=document.documentElement;
      return {width:w,scroll:doc.scrollWidth,viewportHeight:innerHeight,
       active:[...document.querySelectorAll('.screen')].filter(s=>!s.hidden).map(s=>s.id),
       nav:document.querySelector('.bottom-nav')?.getBoundingClientRect().toJSON(),
       status:document.querySelector('#overviewBar')?.getBoundingClientRect().toJSON(),
       picker:document.querySelector('#primaryPicker')?.getBoundingClientRect().toJSON(),
       bodyOverflow:getComputedStyle(document.body).overflowX};
    }""")

def main():
 with local_site() as base,sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   count=0
   for width in (320,390,590,1024):
    for scheme in ("light","dark"):
     context=browser.new_context(viewport={"width":width,"height":844},
       color_scheme=scheme,device_scale_factor=2,service_workers="block")
     context.add_init_script(BOOT)
     context.add_init_script("""window.__visualShifts=[];
       new PerformanceObserver(items=>{for(const entry of items.getEntries())
         if(!entry.hadRecentInput)window.__visualShifts.push(entry.value);
       }).observe({type:'layout-shift',buffered:true});""")
     context.route("https://**/*",lambda r:r.abort())
     page=context.new_page()
     errors=[]
     page.on("pageerror",lambda error:errors.append(str(error)))
     page.goto(base,wait_until="domcontentloaded",timeout=30000)
     ready(page)
     page.wait_for_timeout(550)
     data=inspect(page)
     assert data["scroll"]<=width+3,("PWA initial overflow",width,scheme,data)
     nav=data["nav"]
     assert nav and nav["bottom"]<=845 and nav["bottom"]>=770,("Dock not fixed",width,scheme,nav)
     # No spontaneous expansion of the status, address picker and home chart.
     before=inspect(page)
     page.wait_for_timeout(700)
     after=inspect(page)
     for el in ["picker","status"]:
      a,b=before.get(el),after.get(el)
      if a and b and a["width"] and b["width"]:
       assert abs(a["height"]-b["height"])<2,(width,scheme,el,"height changed",a,b)
       assert abs(a["top"]-b["top"])<2,(width,scheme,el,"unexpected jump",a,b)
     for tab in ["detail","updates","settings","home"]:
      page.locator('.bottom-nav [data-go="'+tab+'"]').click()
      page.wait_for_function("(tab) => !document.getElementById(tab).hidden",arg=tab,timeout=6000)
      page.wait_for_timeout(500)
      data=inspect(page)
      assert data["active"]==[tab],(width,scheme,tab,"wrong active screen",data["active"])
      assert data["scroll"]<=width+3,(width,scheme,tab,"overflow",data)
      assert abs(data["nav"]["bottom"]-nav["bottom"])<4,(width,scheme,tab,"dock moved")
     # A queue expansion must preserve the 12 row elements and reader's scroll context.
     page.locator('.bottom-nav [data-go="detail"]').click()
     page.wait_for_function("() => !document.querySelector('#detail').hidden",timeout=6000)
     page.locator("#allQueuesDetailOpen").click()
     page.wait_for_function("() => document.querySelector('#allQueuesDialog')?.open",timeout=6000)
     size=page.evaluate("""() => ({
      count:document.querySelectorAll('.all-queues-lane').length,
      width:document.querySelector('#allQueuesMatrix').scrollWidth,
      client:document.querySelector('#allQueuesMatrix').clientWidth
     })""")
     assert size["count"]==12 and size["width"]<=size["client"]+1,(width,scheme,size)
     page.evaluate("window.__lane=document.querySelector('.all-queues-lane')")
     page.locator(".all-queues-lane").first.click()
     assert page.locator(".all-queues-detail-panel:not([hidden])").count()==1,(width,scheme,"expanded row missing")
     assert page.evaluate("window.__lane===document.querySelector('.all-queues-lane')"),(
       width,scheme,"tapping a row rebuilt all rows")
     page.evaluate("window.SvitloAllQueues.refresh()")
     assert page.evaluate("window.__lane===document.querySelector('.all-queues-lane')"),(
       width,scheme,"refresh rebuilt unchanged queue chart")
     page.locator("#allQueuesClose").click()
     page.wait_for_function("() => !document.querySelector('#allQueuesDialog').open",timeout=6000)
     assert not errors,(width,scheme,errors)
     context.close();count+=1
   # Plain web pages should never overflow at narrow widths with light/dark palettes.
   context=browser.new_context(viewport={"width":320,"height":750},service_workers="block")
   try:
    context.route("https://**/*",lambda route:route.abort())
    for name in PAGES:
     page=context.new_page()
     errors=[]
     page.on("pageerror",lambda exc:errors.append(str(exc)))
     page.goto(base+name,wait_until="domcontentloaded",timeout=30000)
     page.wait_for_timeout(120)
     val=page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
     assert val["scroll"]<=val["width"]+3,(name,"horizontal overflow",val)
     assert not errors,(name,errors)
     page.close()
   finally:
    context.close()
   print("PASS: 8 viewport/theme combinations, 4 PWA tabs each, stable home geometry and 12-row focus persistence")
   print("PASS: 8 public pages checked for 320px overflow, no JS errors, dock fixed",flush=True)
  finally:
   browser.close()

if __name__=="__main__":
 main()
