"""Run: python tests/mobile_smoke.py. Tests fixed mobile width, locality search and 19:30 gradient."""
import json
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
WIDTHS=[(320,568)]
DATE=datetime.now(ZoneInfo('Europe/Kyiv')).date().isoformat()

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


def main():
    with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            try:
                for width,height in WIDTHS:
                    page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
                    errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    address_data={'keys':{},'streets':{},'localities':{
                        'слобода':{'keys':{},'streets':{'вулиця|лісова':'Вулиця Лісова'},'streetQueues':{'вулиця|лісова':['3.1']}},
                        'хацьки':{'keys':{'вулиця|молодіжна|12':['4.2']},'streets':{'вулиця|молодіжна':'Вулиця Молодіжна'},'streetQueues':{}}
                    }}
                    schedules={'days':[{'date':DATE,'verified':True,'publishedAt':datetime.now(ZoneInfo('Europe/Kyiv')).isoformat(),
                                         'queues':{'4.2':{'knownFrom':'00:00','off':[['19:30','21:00']]},'3.1':{'knownFrom':'00:00','off':[['19:30','21:00']]}}}],
                               'lastChecked':datetime.now(ZoneInfo('Europe/Kyiv')).isoformat()}
                    page.set_content((ROOT/'index.html').read_text(encoding='utf-8'))
                    page.add_style_tag(content=(ROOT/'style.css').read_text(encoding='utf-8'))
                    page.evaluate('([a,s])=>{let db={};Object.defineProperty(window,\'localStorage\',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}});window.fetch=async url=>({ok:true,json:async()=>String(url).includes("addresses.json")?a:String(url).includes("schedules.json")?s:{}})}', [address_data,schedules])
                    page.add_script_tag(content=(ROOT/'hour-paint.js').read_text(encoding='utf-8'))
                    page.add_script_tag(content=(ROOT/'app.js').read_text(encoding='utf-8'))
                    page.wait_for_function('Object.keys(window.SvitloHour||{}).length > 0')
                    page.locator('#addFromHome').click()
                    page.locator('#settlement').select_option('Хацьки')
                    page.locator('#street').fill('Молодіжна')
                    page.locator('#house').fill('12')
                    page.wait_for_function("document.querySelector('#lookupFeedback').textContent.includes('4.2')")
                    page.locator('#saveAddress').click()
                    page.locator('[data-go="detail"]').last.click()
                    page.locator('.hour-cell').nth(19).wait_for()
                    css=page.locator('.hour-cell').nth(19).evaluate('(el)=>getComputedStyle(el).backgroundImage')
                    assert 'rgb(224, 245, 231) 0%' in css and 'rgb(44, 60, 84) 50%' in css, css
                    page.locator('#editActive').click()
                    page.locator('#settlement').select_option('Слобода')
                    page.locator('#street').fill('Лісова')
                    page.locator('#house').fill('27')
                    page.wait_for_function("document.querySelector('#lookupFeedback').textContent.includes('3.1')")
                    assert 'не підтверджен' in page.locator('#lookupFeedback').inner_text()
                    assert page.locator('#manualQueue').input_value()=='3.1'
                    page.locator('#closeSheet').click()
                    sizes=page.evaluate('({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth})')
                    assert sizes['scroll'] <= sizes['viewport']+1,(width,sizes)
                    assert not errors, errors
                    print(f'PASS {width}×{height}: village lookup, 19:30 direction, stable width')
                    page.close()
            finally: browser.close()

if __name__=='__main__': main()
