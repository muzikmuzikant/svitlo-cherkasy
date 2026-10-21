"""Inspect all public subpages in DARK mode with real browser computed styles.
   External APIs are blocked. Checks deliberately cover nested panels, not just body.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site

AREAS={
 'feedback.html': ['.support-hero','.support-card','.support-side-card','.support-diagnostics','.support-import','.support-privacy'],
 'help.html':['.hero','.search','.quick','.contact','.ticket-status'],
 'privacy.html':['.body','.note','.hero'],
 'terms.html':['article','.hero','.note'],
 'about.html':['.box'],
 'advertising.html':['.benefit','.format','.phone','.faq details'],
 'support-project.html':['.why-text','.goal','.gratitude','.faq details'],
 'ad-detail.html':['.article','.aside','.back'],
}
def main():
 with local_site() as base,sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={"width":390,"height":844},color_scheme="dark",service_workers="block")
  context.add_init_script("""
    localStorage.setItem('svitlo-appearance-v1','dark');
    localStorage.setItem('svitlo-beta-analytics-choice','declined');
  """)
  context.route("https://**/*",lambda route:route.abort())
  try:
   for path,areas in AREAS.items():
    page=context.new_page()
    page.goto(base+path,wait_until='domcontentloaded',timeout=30000)
    page.wait_for_function("() => document.documentElement.dataset.theme==='dark'",timeout=5000)
    result=page.evaluate("""(areas)=>{
      function color(x){
        const m=x.match(/rgba?\\(([^)]+)\\)/);
        if(!m)return null;
        const v=m[1].split(',').map(Number);
        return v.length>=3?v.slice(0,3):null;
      }
      function brightness(values){
        const [r,g,b]=values.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
        return r*.2126+g*.7152+b*.0722;
      }
      function contrast(a,b){
        const x=brightness(a),y=brightness(b);
        return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
      }
      const rows=[],issues=[];
      function displayed(el){
        for(let node=el;node;node=node.parentElement){
          const st=getComputedStyle(node);
          if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.05)return false;
        }return true;
      }
      function surface(element){
        for(let el=element;el;el=el.parentElement){
          const st=getComputedStyle(el);
          const c=color(st.backgroundColor);
          if(c&&st.backgroundColor!=='rgba(0, 0, 0, 0)')return c;
        }
        return [9,11,15];
      }
      for(const selector of areas){
        const el=document.querySelector(selector);
        if(!el||!displayed(el))continue;
        const st=getComputedStyle(el),bg=surface(el);
        rows.push({selector,background:st.backgroundColor,color:st.color});
        // White cards (>230 on all RGB) are forbidden on secondary dark pages,
        // except explicit hero CTA buttons which are not in this area list.
        if(bg.every(v=>v>224))issues.push('white panel '+selector+': '+st.backgroundColor);
      }
      const scan=[...document.querySelectorAll('main h1,main h2,main h3,main p,main small,main label,main summary,main li,main input,main textarea,main select,.support-shell h2,.support-shell p,.support-shell small')];
      let checked=0;
      for(const el of scan){
        if(!displayed(el)||!el.getBoundingClientRect().width||!el.getBoundingClientRect().height)continue;
        const st=getComputedStyle(el),fg=color(st.color),bg=surface(el);
        if(!fg)continue;
        const ratio=contrast(fg,bg);
        if(ratio<4.0&&checked<200)issues.push('low contrast '+el.tagName.toLowerCase()+'.'+el.className+': '+ratio.toFixed(2)+' '+st.color+' on '+bg);
        checked++;
      }
      return {theme:document.documentElement.dataset.theme,rows,checked,issues:issues.slice(0,35),viewport:document.querySelector('meta[name=viewport]')?.content}
    }""",areas)
    assert result['theme']=='dark',(path,result)
    assert 'user-scalable=no' in result['viewport'],(path,result['viewport'])
    assert result['checked']>1,(path,result)
    assert not result['issues'],path+': '+repr(result['issues'])
    print(f"PASS: {path}: {len(result['rows'])} tested dark panels; {result['checked']} visible labels")
    page.close()
  finally:
   browser.close()

if __name__=="__main__":
 main()
