"""Svitlo Office browser smoke with mocked PRIVATE backend: no real credentials or users."""
from __future__ import annotations
import contextlib
import functools
import http.server
import json
from pathlib import Path
import threading
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1] / "_site"

class Local(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(SITE),**kwargs)
    def log_message(self,*args):
        pass

@contextlib.contextmanager
def serve():
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1",0),Local)
    thread = threading.Thread(target=httpd.serve_forever,daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}/"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=3)

def main():
    assert (SITE/"admin-office.js").is_file(), "Build static web files first"
    with serve() as base, sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        context=browser.new_context(viewport={"width":1440,"height":900},service_workers="block")
        # Route ALL external calls so test cannot send real admin credentials.
        example={
            "id":"WR-112233445566","title":"Приклад тестового доручення",
            "kind":"addresses","status":"new","priority":"urgent","assignee":"owner",
            "reference":"SC-0123456789","dueDate":"2026-10-21","details":"Лише тестові дані",
            "revision":1,"events":[{"at":"2026-10-21T11:00:00.000Z","action":"created","actor":"owner"}],
            "createdAt":"2026-10-21T11:00:00.000Z","updatedAt":"2026-10-21T11:00:00.000Z"
        }
        work=[example]
        config={"schemaVersion":1,"updatedAt":None,"announcements":[],"maintenance":{"enabled":False},
                "site":{"banner":{"enabled":False,"title":"Тестовий банер","body":"Приклад","button":"Далі","url":""},
                        "links":{"help":"./help.html","feedback":"./feedback.html","official":"https://www.cherkasyoblenergo.com/news"},
                        "flags":{"inbox":True,"sharing":True,"help":True,"feedback":True,"copySchedule":True,
                                 "addressSearch":True,"pushPrompt":True,"manualRefresh":True}}}
        def intercept(route):
            request=route.request
            url=urlparse(request.url)
            origin=request.headers.get("origin",base.rstrip("/"))
            headers={"content-type":"application/json","access-control-allow-origin":origin,
                     "access-control-allow-headers":"authorization,content-type",
                     "access-control-allow-methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS"}
            if request.method=="OPTIONS":
                route.fulfill(status=204,headers=headers);return
            if url.path.startswith("/api/admin/"):
                name=url.path.removeprefix("/api/admin/")
                data={}
                status=200
                if name=="login":
                    data={"ok":True,"token":"mock-private-test-token","role":"owner"}
                elif name=="status":
                    data={"ok":True,"editingEnabled":False}
                elif name=="monitor":
                    data={"server":{"pushSubscribers":0},"feedback":{"new":0},"sources":{"review":{"items":[]},"schedules":{"days":[]}}}
                elif name=="work-items" and request.method=="GET":
                    data={"items":work}
                elif name=="work-items" and request.method=="POST":
                    payload=request.post_data_json
                    data={**example,**payload,"id":"WR-ABCDEF112233","revision":1}
                    work.insert(0,data)
                elif name.endswith("/notes") and request.method=="POST":
                    payload=request.post_data_json
                    item=next((x for x in work if x["id"]==name.split("/")[1]),None)
                    if item:
                        item["revision"]+=1
                        item["events"].insert(0,{"at":"2026-10-21T11:05:00.000Z",
                            "actor":"owner","action":"note","message":payload["message"]})
                        data=item
                    else:status=404
                elif name.startswith("work-items/") and request.method=="PATCH":
                    item=next((x for x in work if x["id"]==name.split("/")[1]),None)
                    if item and request.post_data_json.get("expectedRevision")==item["revision"]:
                        original=item["status"]
                        item.update({k:v for k,v in request.post_data_json.items() if k!="expectedRevision"})
                        item["revision"]+=1
                        item["events"].insert(0,{"at":"2026-10-21T11:07:00.000Z",
                            "actor":"owner","action":original+" -> "+item["status"]})
                        data=item
                    else:
                        status=409
                        data={"error":"Картку вже змінено"}
                elif name=="feedback":
                    data={"items":[{"id":"SC-0123456789","topic":"address","status":"new",
                        "subject":"Не знаходить номер будинку","message":"Приклад тестового звернення про адресу."}]}
                elif name=="feedback/templates":data={"templates":[]}
                elif name=="address-corrections":data={"items":[]}
                elif name in ("app-config","site-quick-settings"):data=config
                elif name=="audit":data={"events":[]}
                elif name=="push/status":data={"subscriptions":0}
                elif name=="help":data={"articles":[]}
                else:
                    data={"items":[],"ok":True,"events":[],"announcements":[]}
                route.fulfill(status=status,headers=headers,body=json.dumps(data,ensure_ascii=False));return
            # Abort other external services, images and data.
            route.abort()
        context.route("https://**/*",intercept)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda exc:errors.append(str(exc)))
        page.goto(base+"admin.html",wait_until="domcontentloaded")
        page.wait_for_function("document.querySelector('#server')?.value.startsWith('https://')")
        page.locator("#password").fill("test-password-not-real")
        page.locator("#connect").click()
        page.wait_for_function("document.querySelector('#adminDashboard')?.hidden===false",timeout=12000)
        page.wait_for_function("document.querySelectorAll('#officeStats .office-stat').length===5",timeout=15000)
        assert page.locator(".office-work-entry").count()==1
        assert page.locator(".office-ticket-entry").count()==1
        # At-risk task must not be buried in an ordinary, silent registry row.
        page.locator("#officeWorkAttention .office-attention-filter.overdue strong").wait_for()
        assert page.locator("#officeWorkAttention .office-attention-filter.overdue strong").inner_text()=="1"
        assert page.locator(".office-task-badge").inner_text()=="1"
        assert page.locator(".office-attention-item").count()==1
        page.locator(".office-create").click()
        assert page.locator("#officeModal").is_visible()
        page.get_by_role("button",name="Нова картка доручення").click()
        page.locator("[data-admin-panel=registry]").wait_for(state="visible",timeout=6000)
        page.locator("#workNew").click()
        page.locator("#workTitle").fill("Перевірити нову адресу")
        page.locator("#workDetails").fill("Зареєстровано з браузерного тесту")
        page.locator("#workSave").click()
        page.wait_for_function("document.querySelector('#workEditTitle')?.textContent.includes('WR-ABCDEF112233')",timeout=8000)
        assert page.locator(".work-quick-button").filter(has_text="Взяти в роботу").count()==1
        page.locator(".work-quick-button").filter(has_text="Взяти в роботу").click()
        page.wait_for_function("document.querySelector('#workStatus')?.value==='in_progress'",timeout=6000)
        # An auto-refresh must not destroy an unsaved operator draft.
        page.locator("#workDetails").fill("Чернетка з перевірки, не втрачати")
        page.locator("#adminRegisterReload").click()
        page.wait_for_function("document.querySelector('#adminRegisterMessage')?.textContent.includes('Незбережений')",timeout=6000)
        assert page.locator("#workDetails").input_value()=="Чернетка з перевірки, не втрачати"
        page.locator("#workDetails").fill("Зареєстровано з браузерного тесту")
        page.locator("#workNote").fill("Перевірити офіційний перелік, відповідь ще очікується")
        page.locator("#workNoteSend").click()
        page.wait_for_function("document.querySelector('#workEvents')?.textContent.includes('Резолюція')",timeout=8000)
        assert page.locator("#workEvents").get_by_text("Перевірити офіційний перелік",exact=False).count()==1
        # Connected records should open the actual support conversation.
        page.locator("#adminRegisterList .registry-row").filter(has_text="WR-112233445566").click()
        page.locator(".work-linked-ticket").click()
        page.wait_for_function("document.querySelector('[data-admin-panel=feedback]')?.hidden===false",timeout=6000)
        assert page.locator("#ticketDetail").get_by_text("Не знаходить номер будинку").count()>=1
        page.set_viewport_size({"width":390,"height":844})
        page.locator(".office-menu-button").click()
        assert page.evaluate("document.body.classList.contains('office-mobile-nav')")
        assert page.locator('.phone-menu-drawer').is_visible()
        assert page.locator('nav.admin-tabs').is_hidden()
        page.locator('[data-phone-section="feedback"]').click()
        assert not page.evaluate("document.body.classList.contains('office-mobile-nav')")
        page.wait_for_function("document.querySelectorAll('#ticketsList .desk-ticket-row').length===1",timeout=6000)
        assert page.locator("#ticketDetail .desk-detail-tabs button").count()==4
        assert page.locator(".desk-github-note").count()==1
        assert page.locator(".desk-hub-link").count()==11  # Social channels added to the workbench
        page.locator("#ticketsList .ticket-row").click()
        page.wait_for_function("document.body.classList.contains('desk-ticket-open')",timeout=5000)
        assert page.locator("#ticketDetail").is_visible()
        assert page.locator("#ticketDetail .desk-back").is_visible()
        page.locator("#ticketDetail [data-desk-tab='conversation']").click()
        assert page.locator("#ticketDetail .desk-pane[data-desk-pane='conversation']").is_visible()
        assert not page.locator("#ticketDetail .desk-pane[data-desk-pane='overview']").is_visible()
        page.locator("#ticketDetail .desk-back").click()
        assert not page.evaluate("document.body.classList.contains('desk-ticket-open')")
        # Bulk controls must not delete any correspondence or contact information.
        page.locator("#ticketsList .desk-ticket-row > input").check()
        assert page.locator(".desk-bulk").is_visible()
        assert page.locator(".desk-bulk select option[value='resolved']").count()==1
        page.locator(".desk-bulk button.secondary").click()
        assert not page.locator(".desk-bulk").is_visible()
        # Sweep every administrative section with fake data at desktop and phone sizes.
        # A hidden or clipped primary workspace must not pass as a polished UI.
        sections=["overview","registry","corrections","insights","quality","operations","push",
                  "media","ads","social","feedback","help","live","features","design",
                  "maintenance","sources","planner","tools","data","security","backup",
                  "revisions","audit"]
        audit=[]
        for width,height in [(1280,900),(390,844)]:
            page.set_viewport_size({"width":width,"height":height})
            for name in sections:
                page.locator('[data-admin-tab="'+name+'"]').evaluate("(el) => el.click()")
                page.wait_for_timeout(35)
                result=page.evaluate("""(section)=>{
                    const panel=[...document.querySelectorAll('#adminDashboard > [data-admin-panel]')]
                      .find(p=>p.dataset.adminPanel===section && !p.hidden);
                    const rect=panel?.getBoundingClientRect();
                    return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,
                      right:rect?.right,visible:Boolean(panel)};
                }""",name)
                assert result["visible"], f"{width}px: missing selected admin panel {name}"
                assert result["scroll"]<=width+4, f"{width}px: horizontal overflow in {name}: {result}"
                assert result["right"] is not None and result["right"]<=width+8, (
                    f"{width}px: workspace clipped in {name}: {result}")
                audit.append((width,name))
        assert len(audit)==48
        page.locator('[data-admin-tab="overview"]').evaluate('(element)=>element.click()')
        page.wait_for_timeout(380)
        panel_motion=page.evaluate("getComputedStyle(document.querySelector('#adminDashboard > [data-admin-panel=overview]')).animationName")
        assert panel_motion=='none', 'Admin panel has overlapping CSS animation: '+panel_motion
        assert page.evaluate('!!window.SvitloMicroMotion')
        assert not errors, "Browser runtime exceptions: "+"; ".join(errors)
        print("Svitlo Office browser passed: workflow, linked tickets, mobile and 24-tab visual sweep.")
        context.close();browser.close()

if __name__=="__main__":
    main()
