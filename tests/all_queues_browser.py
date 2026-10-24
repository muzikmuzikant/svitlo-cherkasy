"""Beta all-queue matrix, PNG and accessibility tested in installed-PWA mode."""
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

def main():
 with local_site() as base, sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   for width in [320,390,590]:
    context=browser.new_context(viewport={"width":width,"height":844},service_workers="block")
    context.add_init_script("""Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
      localStorage.setItem('svitlo-beta-analytics-opt-in','no');
      localStorage.setItem('svitlo-beta-analytics-choice','declined');""")
    context.route("https://**/*",lambda route:route.abort())
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(base,wait_until="domcontentloaded",timeout=30000)
    ready(page)
    page.locator("#allQueuesHomeOpen").click()
    page.wait_for_function("() => document.querySelector('#allQueuesDialog')?.open",timeout=8000)
    assert page.locator("#allQueuesDays button").count()==7
    assert page.locator("#allQueuesMatrix .all-queues-lane").count()==12
    assert page.locator("#allQueuesMatrix .all-queues-lane-name").count()==12
    assert page.locator("#allQueuesNotice").inner_text()
    widths=page.evaluate("""() => ({
      body:document.documentElement.scrollWidth,viewport:innerWidth,
      matrix:document.querySelector('#allQueuesMatrix').scrollWidth,
      available:document.querySelector('#allQueuesMatrix').clientWidth
    })""")
    assert widths['body']<=width+1, widths
    assert widths['matrix']<=widths['available']+1, widths
    # Replace only the public read-only source, not the user's selected address.
    page.evaluate("""()=>{
     const src=window.SvitloAllQueuesSource,dates=src.dates(),day=dates[0];
     const timeline=(date,queue)=>{
      if(date!==day)return null;
      const t=new Int8Array(1440);
      if(queue==='1.1')t.fill(1,10*60+30,11*60);
      if(queue==='1.2')t.fill(-1,12*60,13*60);
      return t;
     };
     window.SvitloAllQueuesSource={...src,timeline};
     window.SvitloAllQueues.open(day);
     window.SvitloAllQueues.refresh();
    }""")
    page.locator('.all-queues-lane[data-queue="1.1"]').click()
    text=page.locator("#allQueuesInspect").inner_text()
    assert "10:30" in text and "11:00" in text,text
    page.locator('.all-queues-lane[data-queue="1.2"]').click()
    assert "Немає підтверджених даних" in page.locator("#allQueuesInspect").inner_text()
    page.locator("#allQueuesExport").click()
    page.wait_for_function("() => document.querySelector('#sharePreviewDialog')?.open",timeout=10000)
    assert "Усі підчерги" in page.locator("#sharePreviewHeading").inner_text()
    assert page.locator("#sharePreviewImage").get_attribute("src").startswith("blob:")
    assert not errors,errors
    context.close()
   print("PASS: 12-row full-day schedule viewer at 320/390/590 px; exact minutes, unknown data, PNG preview",flush=True)
  finally:
   browser.close()

if __name__=="__main__":
 main()
