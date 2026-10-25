"""Mobile PWA Chromium layout smoke without Railway access."""
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site
def main():
 with local_site() as base,sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  try:
   for width,height in ((320,740),(390,844),(430,932)):
    context=browser.new_context(viewport={'width':width,'height':height},service_workers='block')
    context.route('https://**/*',lambda route:route.abort())
    page=context.new_page()
    page.goto(base+'admin-app/',wait_until='domcontentloaded',timeout=30000)
    page.wait_for_function("""() => document.body.classList.contains('svitlo-office')
      && !!document.querySelector('.office-mobile-dock')
      && !!document.querySelector('.phone-quick')""",timeout=12000)
    page.evaluate("""() => {
     document.getElementById('adminDashboard').hidden=false;
     document.getElementById('adminLoginScreen').hidden=true;
     document.body.classList.remove('admin-auth-checking');
     window.SvitloAdminAccess.apply({username:'Layout QA',role:'owner',managed:false});
     document.dispatchEvent(new Event('svitlo:admin-ready'));
    }""")
    assert page.locator('.office-mobile-dock').is_visible(),width
    assert page.locator('.phone-quick').is_visible(),width
    assert page.locator('.office-mobile-dock svg').count()>=5,width
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
    page.locator('[data-mobile-tab="feedback"]').click()
    page.wait_for_function("""() => document.querySelector('[data-admin-tab="feedback"]')?.getAttribute('aria-pressed')==='true'""",timeout=5000)
    page.locator('[data-mobile-tab="menu"]').click()
    page.wait_for_function("""() => document.body.classList.contains('office-mobile-nav')""",timeout=3000)
    page.locator('.phone-menu-drawer').wait_for(state='visible',timeout=3000)
    assert page.locator('nav.admin-tabs').is_hidden(),width
    page.locator('.phone-menu-toggle').last.click()
    assert page.locator('.phone-menu-group').last.locator('.phone-menu-items').is_visible(),width
    checks=page.evaluate("""() => {
     const visible=[...document.querySelectorAll('.phone-menu-link')]
      .filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible');
     const collisions=[];
     for(let i=1;i<visible.length;i++){
       if(visible[i-1].parentElement!==visible[i].parentElement)continue;
       if(visible[i].getBoundingClientRect().top<visible[i-1].getBoundingClientRect().bottom-1)
        collisions.push([visible[i-1].textContent,visible[i].textContent]);
     }
     return {visible:visible.length,overlaps:collisions};
    }""")
    assert checks['visible']>=4,(width,checks)
    assert not checks['overlaps'],(width,checks)
    page.locator('.phone-menu-close').click()
    page.wait_for_function("""() => !document.body.classList.contains('office-mobile-nav')""",timeout=3000)
    print('PASS phone PWA',width)
    context.close()
  finally:browser.close()
if __name__=='__main__':main()
