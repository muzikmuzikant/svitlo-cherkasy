"""Regression for Chrome address-save prompts and overlapping Office sidebar.
Runs against locally built files in isolated Chromium, without Railway access.
"""
from __future__ import annotations
from playwright.sync_api import sync_playwright
from offline_pwa_browser import local_site

def nav_state(page):
    return page.evaluate("""() => {
      const nav=document.querySelector('#adminDashboard > nav.admin-tabs');
      const groups=[...nav.querySelectorAll('.control-nav-group')];
      for(const group of groups){group.classList.remove('office-folded');group.hidden=false;}
      const items=[...nav.querySelectorAll('.control-nav-search,.control-nav-group,.control-nav-foot')].filter(
        x=>getComputedStyle(x).display!=='none');
      const shapes=items.map(x=>({name:x.className,top:x.offsetTop,height:x.offsetHeight,
        shrink:getComputedStyle(x).flexShrink}));
      const links=[...nav.querySelectorAll('.office-nav-link')].filter(
        x=>getComputedStyle(x).display!=='none');
      const collisions=[];
      for(const group of groups){
        let previous=null;
        for(const button of group.querySelectorAll(':scope > button')){
          if(getComputedStyle(button).display==='none')continue;
          const r=button.getBoundingClientRect();
          if(previous&&r.top < previous.bottom-1){
            collisions.push({a:previous.title,b:button.textContent,overlap:previous.bottom-r.top});
          }
          previous={bottom:r.bottom,title:button.textContent};
        }
      }
      const groupOverlap=[];
      for(let n=1;n<shapes.length;n++)
        if(shapes[n].top < shapes[n-1].top+shapes[n-1].height-1)
          groupOverlap.push({previous:shapes[n-1],current:shapes[n]});
      return {navHeight:nav.clientHeight,navScrollHeight:nav.scrollHeight,
        groupOverlap,collisions,shapes,links:links.length};
    }""")

def check_forms(page):
    return page.evaluate("""() => {
      const ids=['corrForm','workForm','liveConfigForm'];
      const result=[];
      for(const id of ids){
        const form=document.getElementById(id);
        if(!form)throw Error('Missing admin form '+id);
        const originalSubmitters=[...form.querySelectorAll('[data-admin-save-action]')];
        if(!originalSubmitters.length)throw Error('Missing safe button '+id);
        if(form.autocomplete!=='off')throw Error('Unexpected autocomplete '+id);
        // The admin is intentionally not logged in during isolated UI tests:
        // private API logic disables editors. Enable only local DOM controls.
        for(const input of form.querySelectorAll('input,select,textarea,button'))input.disabled=false;
        for(const input of form.querySelectorAll('[required]')){
          if(input instanceof HTMLSelectElement){
            let option=[...input.options].find(x=>x.value&&!x.disabled);
            if(!option){option=new Option('Тестова вулиця','test-street');input.add(option);}
            input.value=option.value;
          }else if(input.type==='url')input.value='https://example.com/check';
          else input.value='Valid test document';
        }
        const native=[],button=originalSubmitters[0];
        form.addEventListener('submit',ev=>{
          native.push(ev.isTrusted);ev.stopImmediatePropagation();
        },true);
        button.click();
        result.push({id,buttonType:button.type,submitEvents:native,
          submitted:form.reportValidity(),nativeSubmit:native.includes(true)});
      }
      const login=document.getElementById('loginForm');
      return {result,loginAutocomplete:{
        user:login.querySelector('#adminUsername').autocomplete,
        password:login.querySelector('#password').autocomplete}};
    }""")

def main():
    with local_site() as base, sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            for width,height in [(1440,900),(1100,740),(390,844)]:
                ctx=browser.new_context(viewport={'width':width,'height':height},
                    service_workers='block',color_scheme='light')
                ctx.route('https://**/*',lambda route:route.abort())
                page=ctx.new_page()
                page.goto(base+'admin.html',wait_until='domcontentloaded',timeout=30000)
                page.wait_for_function("""() =>
                  document.body.classList.contains('svitlo-office') &&
                  document.querySelectorAll('.office-nav-link').length>=18 &&
                  document.querySelector('#workForm button[data-admin-save-action]')!==null
                """,timeout=12000)
                page.evaluate("""() => {
                  document.body.classList.remove('admin-auth-checking');
                  const d=document.getElementById('adminDashboard');
                  d.hidden=false;document.getElementById('adminLoginScreen').hidden=true;
                  if(innerWidth<=1050)document.body.classList.add('office-mobile-nav');
                }""")
                layout=nav_state(page)
                assert layout['links']>=18,(width,layout)
                assert not layout['groupOverlap'],(width,layout['groupOverlap'])
                assert not layout['collisions'],(width,layout['collisions'])
                assert all(str(row['shrink'])=='0' for row in layout['shapes']), (
                    width,layout['shapes'])
                if width==1440:
                    assert layout['navScrollHeight']>layout['navHeight'], (
                        'Expanded sidebar must scroll inside itself',layout)
                    saved=check_forms(page)
                    assert saved['loginAutocomplete']=={
                        'user':'username','password':'current-password'},saved
                    for result in saved['result']:
                        assert result['buttonType']=='button',result
                        assert result['submitEvents']==[False],result
                        assert result['submitted'] and not result['nativeSubmit'],result
                    print('PASS: save buttons use synthetic events; native Chrome address-saving cannot trigger')
                    print('PASS: login continues to support browser password manager')
                print('PASS: navigation has no overlap at',width,'px')
                ctx.close()
        finally:
            browser.close()

if __name__=='__main__':main()
