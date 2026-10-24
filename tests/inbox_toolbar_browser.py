"""Regression: unread action must not steal the filter scroll area.
   Zoom gestures must be cancelled without blocking single-finger scrolling.
"""
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

def main():
 with local_site() as base,sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=3,service_workers="block")
  context.add_init_script("""Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
    localStorage.setItem('svitlo-beta-analytics-choice','declined');
    localStorage.setItem('svitlo-beta-analytics-opt-in','no');""")
  context.route("https://**/*",lambda route:route.abort())
  try:
   page=context.new_page()
   page.goto(base,wait_until="domcontentloaded",timeout=30000)
   ready(page)
   page.locator('[data-go="updates"]').first.click()
   page.wait_for_function("() => !!window.SvitloInboxUI?.refresh",timeout=14000)
   result=page.evaluate("""async()=>{
     const mark=document.getElementById('inboxMarkAll');
     const filters=document.querySelector('#updates .inbox-filters');
     const r=element=>element.getBoundingClientRect();
     if(!mark||!filters)throw Error('Inbox controls not found');
     const separation=r(mark).bottom<=r(filters).top || r(mark).top>=r(filters).bottom;
     const params=new URLSearchParams(location.search);
     await window.SvitloInbox.add({id:'push:inbox-layout-audit',title:'Перевірка',
       body:'Перевірка прочитання',kind:'push',at:new Date().toISOString(),read:false});
     await window.SvitloInboxUI.refresh();
     const enabled=!mark.disabled;
     const note=document.getElementById('inboxUnreadNote')?.textContent;
     mark.click();
     await new Promise(resolve=>setTimeout(resolve,400));
     const items=await window.SvitloInbox.all();
     const read=items.find(x=>x.id==='push:inbox-layout-audit')?.read;
     const gesture=new Event('gesturestart',{bubbles:true,cancelable:true});
     document.dispatchEvent(gesture);
     const pinch=new Event('touchmove',{bubbles:true,cancelable:true});
     Object.defineProperty(pinch,'touches',{value:[{},{}]});
     document.dispatchEvent(pinch);
     const touch=new Event('touchmove',{bubbles:true,cancelable:true});
     Object.defineProperty(touch,'touches',{value:[{}]});
     document.dispatchEvent(touch);
     const viewport=document.querySelector('meta[name="viewport"]').content;
     return {separation,enabled,note,read,gesture:gesture.defaultPrevented,
      pinch:pinch.defaultPrevented,singleTouchStopped:touch.defaultPrevented,
      markFinished:mark.disabled,viewport,
      filtersWidth:r(filters).width,containerWidth:r(document.getElementById('updates')).width};
   }""")
   assert result['separation'],result
   assert result['enabled'] and result['read'],result
   assert result['markFinished'],result
   assert result['gesture'] and result['pinch'] and not result['singleTouchStopped'],result
   assert 'maximum-scale=1' in result['viewport'] and 'user-scalable=no' in result['viewport'],result
   assert result['filtersWidth']<=result['containerWidth']+1,result
   print('PASS: button separated from independently scrollable filters; all messages read; gestures blocked; single-touch scroll kept')
  finally:
   browser.close()

if __name__=='__main__':
 main()
