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
      && !!document.querySelector('.office-mobile-dock [data-mobile-tab="planner"]')
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
    assert page.locator('[data-admin-tab="feedback"]').get_attribute('aria-pressed')=='true',width
    page.locator('[data-mobile-tab="menu"]').click()
    assert page.locator('body').evaluate("e=>e.classList.contains('office-mobile-nav')"),width
    page.locator('.phone-drawer-close').click()
    assert not page.locator('body').evaluate("e=>e.classList.contains('office-mobile-nav')"),width
    print('PASS phone PWA',width)
    context.close()
  finally:browser.close()
if __name__=='__main__':main()
