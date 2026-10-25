"""Svitlo Office limited account scope and reload persistence, with fake Railway only."""
from __future__ import annotations
import json
from datetime import datetime,timezone,timedelta
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from admin_office_browser import serve

def main():
    with serve() as base,sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            context=browser.new_context(viewport={"width":390,"height":844},service_workers="block")
            login_count=[0]
            revoked=[False]
            def intercept(route):
                req=route.request
                url=urlparse(req.url)
                headers={"content-type":"application/json",
                         "access-control-allow-origin":req.headers.get("origin",base.rstrip("/")),
                         "access-control-allow-headers":"authorization,content-type",
                         "access-control-allow-methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS"}
                if req.method=="OPTIONS":
                    route.fulfill(status=204,headers=headers);return
                if url.path=="/api/admin/login":
                    login_count[0]+=1
                    route.fulfill(status=200,headers=headers,body=json.dumps({
                        "ok":True,"token":"fake-session-token-for-visual-test",
                        "username":"staff1","role":"editor","permissions":["feedback"],"managed":True
                    }));return
                if url.path=="/api/admin/status":
                    if revoked[0]:
                        route.fulfill(status=401,headers=headers,body='{"error":"Сеанс завершився"}');return
                    expires=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
                    route.fulfill(status=200,headers=headers,body=json.dumps({
                        "ok":True,"username":"staff1","role":"editor","permissions":["feedback"],
                        "managed":True,"editingEnabled":False,"editable":[],"expiresAt":expires,
                    }));return
                if url.path=="/api/admin/logout":
                    route.fulfill(status=200,headers=headers,body='{"ok":true}');return
                if url.path in ("/api/admin/feedback","/api/admin/feedback/templates",
                                "/api/admin/feedback/categories"):
                    route.fulfill(status=200,headers=headers,body='{"items":[],"templates":[],"categories":[]}');return
                # A restricted account must not access other admin data.
                route.fulfill(status=403,headers=headers,body='{"error":"Недостатньо прав"}')
            context.route("https://**/*",intercept)
            page=context.new_page()
            page.goto(base+"admin.html",wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#server')?.value.startsWith('https://')")
            page.locator("#adminUsername").fill("staff1")
            page.locator("#password").fill("some-fake-password")
            page.locator("#connect").click()
            page.wait_for_function("document.querySelector('#adminDashboard')?.hidden===false",timeout=15000)
            assert page.locator(".office-my-account-name").inner_text()=="staff1"
            assert page.locator(".office-identity-text strong").inner_text()=="staff1"
            for tab in ("security","push","operations","media","ads","registry","corrections",
                        "insights","planner","sources","live","features","design","maintenance"):
                assert page.locator('[data-admin-tab="'+tab+'"]').is_hidden(),tab
            # On phones the old desktop sidebar is deliberately hidden.
            # Source tabs still hold authoritative privileges and event handlers.
            assert page.locator("nav.admin-tabs").is_hidden()
            for tab in ("overview","feedback"):
                assert page.locator('[data-admin-tab="'+tab+'"]').get_attribute('hidden') is None,tab
            page.locator('.office-menu-button').click()
            page.locator('.phone-menu-drawer').wait_for(state="visible",timeout=3000)
            for tab in ("overview","feedback"):
                assert page.locator('[data-phone-section="'+tab+'"]').get_attribute('hidden') is None,tab
            for tab in ("security","push","operations","media","ads","registry","planner"):
                assert page.locator('[data-phone-section="'+tab+'"]').get_attribute('hidden') is not None,tab
            page.locator('.phone-menu-close').click()
            page.wait_for_function("() => !document.body.classList.contains('office-mobile-nav')",timeout=3000)
            assert page.locator("#monitorMetrics").is_hidden()
            assert page.locator(".desk-hub-link[data-admin-target=feedback]").is_visible()
            assert page.locator(".desk-hub-link[data-admin-target=ads]").is_hidden()
            assert page.locator('[data-ops-jump="push"]').is_hidden()
            # The same tab survives a hard refresh without exposing the password.
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#adminDashboard')?.hidden===false",timeout=15000)
            assert login_count[0]==1,"Reload prompted for a second login"
            assert page.locator(".office-my-account-name").inner_text()=="staff1"
            assert page.locator("#password").input_value()==""
            assert page.locator('[data-admin-tab="security"]').is_hidden()
            # A server-side revocation must close a saved session on next refresh.
            revoked[0]=True
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("() => !document.body.classList.contains('admin-auth-checking')",timeout=12000)
            assert page.locator("#adminDashboard").is_hidden()
            assert page.locator("#adminLoginScreen").is_visible()
            assert page.evaluate("sessionStorage.getItem('svitlo-office-session-v1')") is None
            print("PASS: scoped modules, account identity, reload persistence and revocation",flush=True)
            context.close()
        finally:browser.close()
if __name__=="__main__":
    main()
