"""Only synthetic screenshots for a human review of every public PWA page.

No real API calls, personal addresses, push subscriptions, passwords or tickets.
Emits JPEG contact sheets in GitHub Actions logs in manageable text chunks.
"""
from __future__ import annotations
from io import BytesIO
import base64
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site,ready

PAGES=["feedback.html","help.html","privacy.html","terms.html",
       "about.html","advertising.html","ad-detail.html","support-project.html"]
TABS=["home","detail","updates","settings"]

def print_sheet(name,snaps):
    width,height=310,680
    cols=4
    rows=(len(snaps)+cols-1)//cols
    dest=Image.new('RGB',(cols*width,rows*(height+27)), '#e9eef3')
    draw=ImageDraw.Draw(dest)
    for i,(title,jpg) in enumerate(snaps):
        shot=Image.open(BytesIO(jpg)).convert('RGB')
        shot.thumbnail((width,height))
        x=(i%cols)*width+(width-shot.width)//2
        y=(i//cols)*(height+27)+27
        dest.paste(shot,(x,y))
        draw.text(((i%cols)*width+8,y-21),title,fill='#142338',font=ImageFont.load_default())
    out=BytesIO()
    dest.save(out,format='JPEG',quality=61,optimize=True)
    encoded=base64.b64encode(out.getvalue()).decode('ascii')
    print(f"AUDIT_IMAGE_BEGIN {name} {dest.size} {len(encoded)}",flush=True)
    for start in range(0,len(encoded),3500):
        print("AUDIT_IMAGE_CHUNK "+name+" "+encoded[start:start+3500],flush=True)
    print("AUDIT_IMAGE_END "+name,flush=True)

def main():
 with local_site() as base,sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   for mode in ('light','dark'):
    context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=1,
      color_scheme=mode,service_workers="block")
    context.route("https://**/*",lambda r:r.abort())
    context.add_init_script("""(()=>{
      Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
      localStorage.setItem('svitlo-appearance-v1','__MODE__');
      localStorage.setItem('svitlo-beta-analytics-choice','declined');
      localStorage.setItem('svitlo-beta-analytics-opt-in','no');
      localStorage.setItem('svitlo-addresses-v6',JSON.stringify([{
        id:'visual-audit',settlement:'Черкаси',street:'Тестова',
        house:'1',queue:'1.1',favorite:false
      }]));
      localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'visual-audit'}));
    })();""".replace("__MODE__",mode))
    page=context.new_page();page.goto(base,wait_until='domcontentloaded');ready(page)
    shells=[]
    for tab in TABS:
     page.locator('.bottom-nav [data-go="'+tab+'"]').first.click()
     page.wait_for_function("(tab)=>document.querySelector('#'+tab)?.hidden===false",arg=tab)
     page.wait_for_timeout(390)
     shells.append((tab,page.screenshot(type='jpeg',quality=55)))
    print_sheet('shell-'+mode,shells)
    page.close()
    pages=[]
    for target in PAGES:
     item=context.new_page()
     item.goto(base+target,wait_until='domcontentloaded')
     item.wait_for_timeout(350)
     pages.append((target,item.screenshot(type='jpeg',quality=55)))
     item.close()
    print_sheet('pages-'+mode,pages)
    context.close()
  finally:
   browser.close()

if __name__=="__main__":
 main()
