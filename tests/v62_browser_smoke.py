"""Browser test against the actual shipped static index and real village fallback JSON."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            try:
                for width in (320,375,390,430,768):
                    page=browser.new_page(viewport={'width':width,'height':750},is_mobile=True,has_touch=True)
                    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.set_content((ROOT/'index.html').read_text(encoding='utf8'))
                    page.evaluate("document.documentElement.dataset.appMode='standalone'")
                    page.add_style_tag(content=(ROOT/'style.css').read_text(encoding='utf8'))
                    import json
                    datas={name:json.loads((ROOT/'data'/name).read_text(encoding='utf8')) for name in ('addresses.json','schedules.json','published_street_fallback.json')}
                    page.evaluate('''(datas)=>{
                      const db={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}});
                      window.fetch=async url=>({ok:true,json:async()=>Object.entries(datas).find(([k])=>String(url).includes(k))?.[1]||{}});
                    }''',datas)
                    page.add_script_tag(content=(ROOT/'hour-paint.js').read_text(encoding='utf8'))
                    page.add_script_tag(content=(ROOT/'app.js').read_text(encoding='utf8'))
                    page.wait_for_function("document.querySelector('#primaryName')?.textContent !== null")
                    page.locator('#addFromHome').click()
                    page.locator('#settlement').select_option('Слобода')
                    page.locator('#street').fill('Соборна')
                    page.wait_for_function("document.querySelector('#lookupFeedback').textContent.includes('Можливі підчерги')")
                    assert not page.locator('#possibleQueues').is_hidden()
                    assert page.locator('.possible-queue').count()>=2
                    assert page.locator('#house').input_value()==''
                    page.locator('#house').fill('12')
                    assert 'Можливі підчерги' in page.locator('#lookupFeedback').inner_text()
                    assert not page.locator('#possibleQueues').is_hidden()
                    page.locator('#house').fill('')
                    page.locator('.possible-queue').first.click()
                    assert page.locator('#manualQueue').input_value()!=''
                    assert page.locator('#saveAddress').is_enabled()
                    page.locator('#saveAddress').click()
                    assert page.locator('#placeList .place-card').count()==1
                    page.locator('#editActive').click() if not page.locator('#editActive').is_hidden() else None
                    widths=page.evaluate('({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth})')
                    assert widths['scroll']<=widths['viewport']+1, (width,widths)
                    assert not errors,(width,errors)
                    page.close()
                    print('PASS',width,'px, official Sloboda street-only, optional house, ambiguous queues')
            finally: browser.close()
    finally:
        server.shutdown()
if __name__=='__main__':main()
