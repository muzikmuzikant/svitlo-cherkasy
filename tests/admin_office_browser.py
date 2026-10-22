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
            "kind":"addresses","status":"new","priority":"high","assignee":"owner",
            "reference":"SC-0011223344","dueDate":None,"details":"Лише тестові дані",
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
        page.locator(".office-create").click()
        assert page.locator("#officeModal").is_visible()
        page.get_by_role("button",name="Нова картка доручення").click()
        page.locator("[data-admin-panel=registry]").wait_for(state="visible",timeout=6000)
        page.locator("#workNew").click()
        page.locator("#workTitle").fill("Перевірити нову адресу")
        page.locator("#workDetails").fill("Зареєстровано з браузерного тесту")
        page.locator("#workSave").click()
        page.wait_for_function("document.querySelector('#workEditTitle')?.textContent.includes('WR-ABCDEF112233')",timeout=8000)
        page.locator("#workNote").fill("Перевірити офіційний перелік, відповідь ще очікується")
        page.locator("#workNoteSend").click()
        page.wait_for_function("document.querySelector('#workEvents')?.textContent.includes('Резолюція')",timeout=8000)
        assert page.locator("#workEvents").get_by_text("Перевірити офіційний перелік",exact=False).count()==1
        page.set_viewport_size({"width":390,"height":844})
        page.locator(".office-menu-button").click()
        assert page.evaluate("document.body.classList.contains('office-mobile-nav')")
        page.locator('[data-admin-tab="feedback"]').click()
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
        assert not errors, "Browser runtime exceptions: "+"; ".join(errors)
        print("Svitlo Office browser smoke passed: auth, desk, task creation, note, mobile nav.")
        context.close();browser.close()

if __name__=="__main__":
    main()
