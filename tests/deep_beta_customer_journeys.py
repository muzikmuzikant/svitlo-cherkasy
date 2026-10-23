"""Exercise actual customer controls without sending data to outside services.

Every external URL is denied. The only address is fake and local.
"""
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site, ready

def main():
 with local_site() as base, sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True)
  try:
   for mode in ("light","dark"):
    context=browser.new_context(viewport={"width":390,"height":844},
      has_touch=True,service_workers="block",color_scheme=mode)
    context.add_init_script("""(()=>{
      Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
      localStorage.setItem('svitlo-appearance-v1','__MODE__');
      localStorage.setItem('svitlo-beta-analytics-choice','declined');
      localStorage.setItem('svitlo-beta-analytics-opt-in','no');
      localStorage.setItem('svitlo-addresses-v6',JSON.stringify([{
        id:'fake-audit',settlement:'Черкаси',street:'Тестова',
        house:'1',queue:'1.1',favorite:false
      }]));
      localStorage.setItem('svitlo-prefs-v6',JSON.stringify({primaryId:'fake-audit'}));
      window.__appShares=[];
      navigator.share=async content=>window.__appShares.push(content);
    })();""".replace("__MODE__",mode))
    context.route("https://**/*",lambda route:route.abort())
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.goto(base,wait_until="domcontentloaded");ready(page)
    assert page.locator("#primaryName").inner_text().strip()
    assert page.locator("#heroTitle").inner_text().strip()
    assert page.locator("#sourceStamp").inner_text().strip()
    page.locator('.bottom-nav [data-go="detail"]').first.click()
    page.wait_for_function("() => !document.getElementById('detail').hidden")
    assert page.locator("#days .day-choice").count()==7
    assert page.locator("#hourGrid .hour-cell").count()==24
    for index in range(7):
     day=page.locator("#days .day-choice").nth(index)
     day.click()
     assert day.get_attribute("aria-pressed")=="true"
     assert page.locator("#hourGrid .hour-cell").count()==24

    # Main settings sharing must never leak a street, queue or staging URL.
    page.locator('.bottom-nav [data-go="settings"]').first.click()
    page.locator("#shareApp").click()
    result=page.evaluate("window.__appShares")
    assert len(result)==1,result
    assert result[0]["url"]=="https://svitlo-cherkasy.pp.ua/",result
    assert "Тестова" not in str(result) and "1.1" not in str(result)
    page.locator("#addFromSettings").click()
    page.wait_for_function("() => document.getElementById('addressSheet').open")
    assert page.locator("#street").is_visible()
    page.locator("#closeSheet").click()
    page.wait_for_function("() => !document.getElementById('addressSheet').open")
    page.locator("#primaryPicker").click() if page.locator("#primaryPicker").is_visible() else None
    if page.locator("#placesSheet").is_visible():
     assert page.locator("#placesOptions").inner_text().strip()
     page.locator("#closePlaces").click()
     page.wait_for_function("() => !document.getElementById('placesSheet').open")
    page.locator('.bottom-nav [data-go="updates"]').first.click()
    page.wait_for_function("() => !document.getElementById('updates').hidden")
    assert page.locator("#inboxList").count()==1
    assert page.locator("#inboxMarkAll").count()==1
    assert not errors,"PWA controls in "+mode+": "+repr(errors)
    page.close()
    # Help: search and topic controls should work even when external APIs fail.
    help_page=context.new_page()
    help_page.on("pageerror",lambda exc:errors.append(str(exc)))
    help_page.goto(base+"help.html",wait_until="domcontentloaded")
    help_page.locator("#helpSearch").fill("підчерга")
    help_page.wait_for_timeout(150)
    assert help_page.locator("#helpSearch").input_value()=="підчерга"
    help_page.locator("#helpSearch").fill("абракадабра-нема-такого")
    help_page.wait_for_timeout(150)
    assert help_page.locator("#helpEmpty").is_visible()
    help_page.close()
    # Feedback forms, tabs, context hints and live character count.
    ticket=context.new_page()
    ticket.on("pageerror",lambda exc:errors.append(str(exc)))
    ticket.goto(base+"feedback.html",wait_until="domcontentloaded")
    ticket.locator("#topic").select_option("schedule")
    assert ticket.locator("#topicHint").inner_text().strip()
    ticket.locator("#message").fill("Перевіряємо відображення підчерги та графіка.")
    assert "0 /" not in ticket.locator("#count").inner_text()
    ticket.locator("#tabTickets").click()
    assert ticket.locator("#viewTickets").is_visible()
    assert ticket.locator("#recoverTicket").count()==1
    ticket.locator("#tabNew").click()
    assert ticket.locator("#viewNew").is_visible()
    assert ticket.locator("#message").input_value().startswith("Перевіряємо")
    assert not errors,mode+": "+repr(errors)
    ticket.close();context.close()
    print("PASS: "+mode+" PWA days, 24-hour chart, share, dialogs, inbox, Help search and support drafts",flush=True)
  finally:
   browser.close()

if __name__=="__main__":
 main()
