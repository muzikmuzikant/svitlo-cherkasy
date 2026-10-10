"""Smoke-test the shipped UI, minute-accurate masks, and admin, using Chromium."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text('utf8')
css=(ROOT/'style.css').read_text('utf8')
hour=(ROOT/'hour-paint.js').read_text('utf8')
app=(ROOT/'app.js').read_text('utf8')
files={k:json.loads((ROOT/'data'/k).read_text('utf8')) for k in ('addresses.json','published_street_fallback.json','schedules.json','emergency.json','manual_overrides.json')}

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for w in (320,375,430,768):
        page=browser.new_page(viewport={'width':w,'height':830},is_mobile=True,has_touch=True,device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html)
        page.evaluate("document.documentElement.dataset.appMode='standalone'")
        page.add_style_tag(content=css)
        page.evaluate('''(contents)=>{
           const kv={}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>kv[k]??null,setItem:(k,v)=>kv[k]=String(v)}});
           window.fetch=async u=>({ok:true,json:async()=>Object.entries(contents).find(([k])=>String(u).includes(k))?.[1]||{}});
        }''',files)
        page.add_script_tag(content=hour)
        page.add_script_tag(content=app)
        page.evaluate('''()=>{
          const day=today();
          data={days:[{date:day,verified:true,publishedAt:new Date().toISOString(),source:'https://www.cherkasyoblenergo.com/news',queues:{'1.1':{knownFrom:'00:00',off:[['19:30','20:00']]}}}],changes:[]};
          addresses=[{id:'demo',nickname:'Дім',settlement:'Слобода',street:'Соборна',house:'12',queue:'1.1',method:'street'}];
          prefs.primaryId='demo';navigate('detail');
        }''')
        cell=page.locator('.hour-cell[data-hour="19:00"]')
        assert cell.count()==1
        assert 'mixed' in cell.get_attribute('class')
        assert cell.locator('.hour-ink').count()==3
        assert "50%" in cell.locator(".hour-ink-on").get_attribute("style")
        assert '50%' in cell.locator('.hour-ink-off').get_attribute('style')
        assert cell.locator('.hour-ink-off svg path').count()==2  # diagonal slash
        overflow=page.evaluate('document.documentElement.scrollWidth - innerWidth')
        assert overflow<=1,(w,overflow)
        assert not errors,(w,errors)
        if w==375:
            page.screenshot(path='/mnt/data/svitlo-v63-hour-preview.png',full_page=False)
        print(f'OK {w}px, 19:30 ink masks & glyph, no horizontal overflow')
        page.close()
    # admin layout works without backend
    pg=browser.new_page(viewport={'width':375,'height':800},is_mobile=True)
    pg.set_content((ROOT/'admin.html').read_text('utf8'))
    pg.add_script_tag(content=(ROOT/'admin.js').read_text('utf8'))
    assert pg.locator('#password').count()==1
    assert pg.locator('#addSchedule').count()==1
    print('OK admin controls')
    browser.close()
