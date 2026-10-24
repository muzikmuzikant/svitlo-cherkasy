"""Visual-style regression in a real browser for the installed Beta PWA.
No backend required; all external HTTP(S) traffic is blocked.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready


def test_dark_mode_browser():
    with local_site() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=3,
                service_workers="block",
                color_scheme="dark",
            )
            context.add_init_script("""
                Object.defineProperty(navigator,'standalone',{
                    configurable:true,get:()=>true
                });
            """)
            context.route("https://**/*", lambda route: route.abort())
            page = context.new_page()
            page.goto(base, wait_until="domcontentloaded", timeout=30000)
            ready(page)
            report = page.evaluate("""() => {
              window.SvitloTheme.set('dark');
              const nav=document.querySelector('.bottom-nav');
              if(!nav)throw Error('Navigation not mounted');
              const prop=(element,key,pseudo)=>getComputedStyle(element,pseudo||null).getPropertyValue(key).trim();
              const samples=[
                ['inbox-heading','<div class="inbox-auto-group"><summary class="inbox-auto-summary">Графік · 21 жовтня</summary></div>','.inbox-auto-summary','.inbox-auto-group'],
                ['inbox-description','<article class="inbox-item"><button class="inbox-card-opener"><p>Планове відключення та відновлення світла</p></button></article>','.inbox-card-opener>p','.inbox-item'],
                ['inbox-action','<div class="inbox-context-actions"><button>Переглянути повідомлення</button></div>','.inbox-context-actions button','.inbox-context-actions'],
                ['push-heading','<div class="push-invite"><div class="push-invite-copy"><strong>Сповіщення</strong></div></div>','.push-invite-copy strong','.push-invite'],
                ['queue-heading','<div class="quick-queue-lookup"><strong>Оберіть чергу</strong></div>','.quick-queue-lookup strong','.quick-queue-lookup'],
                ['override-heading','<div class="queue-override-control"><label class="queue-override-toggle"><strong>Моя підчерга</strong></label></div>','.queue-override-toggle strong','.queue-override-control'],
                ['tomorrow-heading','<div class="tomorrow-card"><div class="tomorrow-copy"><strong>Завтра</strong></div></div>','.tomorrow-copy strong','.tomorrow-card'],
                ['setting-heading','<div class="setting-line"><strong>Оформлення</strong></div>','.setting-line strong','.setting-line']
              ];
              function rgb(raw){
                const found=raw.match(/rgba?\\(([^)]+)\\)/);
                if(!found)throw Error('Invalid CSS color: '+raw);
                return found[1].split(',').slice(0,3).map(Number);
              }
              function brightness(c){
                const v=c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
                return v[0]*.2126+v[1]*.7152+v[2]*.0722;
              }
              function contrast(a,b){
                const l1=brightness(rgb(a)),l2=brightness(rgb(b));
                return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
              }
              const rows=[];
              for(const [name,markup,textSelector,surfaceSelector] of samples){
                const host=document.createElement('div');
                host.innerHTML=markup;document.body.append(host);
                const ink=prop(host.querySelector(textSelector),'color');
                const surface=prop(host.querySelector(surfaceSelector),'background-color');
                rows.push({name,ink,surface,ratio:contrast(ink,surface)});
                host.remove();
              }
              const result={
                theme:document.documentElement.dataset.theme,
                navBackground:prop(nav,'background-color'),
                navBorder:prop(nav,'border-top-color'),
                navPill:prop(nav,'background-color','::before'),
                rows,
              };
              return result;
            }""")
            assert report["theme"] == "dark", report
            assert report["navBackground"] == "rgb(17, 21, 27)", report
            assert report["navBorder"] == "rgb(48, 55, 67)", report
            assert report["navPill"] == "rgb(41, 55, 73)", report
            for sample in report["rows"]:
                assert sample["ratio"] >= 4.5, (
                    f"Unreadable dark text {sample['name']} "
                    f"contrast {sample['ratio']:.2f}: "
                    f"{sample['ink']} on {sample['surface']}"
                )
            print("PASS: actual browser checked dark dock, active pill and "
                  f"{len(report['rows'])} text contrasts")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    test_dark_mode_browser()
