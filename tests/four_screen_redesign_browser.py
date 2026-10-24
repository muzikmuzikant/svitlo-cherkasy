"""Four-screen Beta redesign smoke: Settings, saved addresses, full queues and Home.
Runs against local _site, with no Railway writes and no real personal addresses.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

INIT="""Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
localStorage.setItem('svitlo-addresses-v6',JSON.stringify([
{id:'redesign-first',settlement:'Черкаси',street:'Тестова',house:'1',queue:'1.1',nickname:'Дім',favorite:true},
{id:'redesign-second',settlement:'Черкаси',street:'Прикладна',house:'2',queue:'4.1',nickname:'Друга адреса',favorite:false}
]));
localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'redesign-first'}));
localStorage.setItem('svitlo-beta-analytics-choice','declined');
localStorage.setItem('svitlo-beta-analytics-opt-in','no');"""

def main():
 with local_site() as base, sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   for width in (320,390,590):
    for scheme in ('light','dark'):
     context=browser.new_context(viewport={'width':width,'height':844},
                                  device_scale_factor=2,service_workers='block',color_scheme=scheme)
     context.add_init_script(INIT)
     context.route('https://**/*',lambda route:route.abort())
     page=context.new_page()
     errors=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.goto(base,wait_until='domcontentloaded',timeout=30000)
     ready(page)
     assert page.locator('#homeDashboardIntro').is_visible()
     assert page.locator('#placeList .place-row').count()==2
     assert page.locator('#placeList .place-edit-action').count()==2
     assert page.locator('#manageFromHome').is_visible()
     assert page.locator('#homeDashboardDate').inner_text()
     page.locator('.bottom-nav [data-go="settings"]').click()
     page.wait_for_function("() => !document.getElementById('settings').hidden")
     assert page.locator('#settingsPlacesPanel').is_visible()
     assert '2 адреси' in page.locator('#settingsPlacesCount').inner_text()
     assert page.locator('#settings .settings-quick-nav button').count()==0
     assert page.locator('#settings').get_by_role('heading',name='Опції').count()==1
     page.locator('#settingsManagePlaces').click()
     page.wait_for_function("() => document.querySelector('#placesSheet')?.open",timeout=6000)
     assert page.locator('#placesOptions .place-option').count()==2
     assert page.locator('#placesOptions .place-edit-option').count()==2
     page.locator('#placesOptions .place-edit-option').first.click()
     page.wait_for_function("() => document.querySelector('#addressSheet')?.open",timeout=6000)
     assert page.locator('#street').input_value() in ('Тестова','Прикладна')
     page.locator('#closeSheet').click()
     page.wait_for_function("() => !document.querySelector('#addressSheet').open",timeout=6000)
     page.locator('.bottom-nav [data-go="home"]').click()
     page.wait_for_function("() => !document.getElementById('home').hidden")
     page.locator('#allQueuesHomeOpen').click()
     page.wait_for_function("() => document.querySelector('#allQueuesDialog')?.open",timeout=6000)
     assert page.locator('#allQueuesGroupFilters button').count()==0
     assert page.locator('#allQueuesMatrix .all-queues-lane:visible').count()==12
     page.locator('.all-queues-lane[data-queue="1.1"]').click()
     assert page.locator('.all-queues-row-detail').count()==1
     page.evaluate('window.__firstQueue=document.querySelector(".all-queues-lane")')
     page.evaluate('window.SvitloAllQueues.refresh()')
     assert page.evaluate('window.__firstQueue===document.querySelector(".all-queues-lane")')
     page.locator('#allQueuesClose').click()
     page.wait_for_function("() => !document.querySelector('#allQueuesDialog').open",timeout=6000)
     overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
     assert overflow<=3,(width,scheme,'horizontal overflow',overflow)
     if scheme=='dark':
      bg=page.locator('#settingsPlacesPanel').evaluate(
        '(el)=>getComputedStyle(el).backgroundColor')
      assert bg not in ('rgb(255, 255, 255)','white'),(width,bg)
     assert not errors,(width,scheme,errors)
     context.close()
   print('PASS: compact Options, saved addresses, unfiltered 12-row queue viewer and Home at 320/390/590px light/dark')
  finally:
   browser.close()

if __name__=='__main__':
 main()
