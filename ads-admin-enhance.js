/* Campaign search, status filters and sorting for the Beta advertising workspace. */
(()=>{'use strict';
 const root=document.getElementById('betaAdsAdmin');if(!root)return;
 let query='',status='all',sort='default',applyCurrent=null;
 root.addEventListener('change',event=>{if(event.target.matches('input[type=checkbox],input[type=datetime-local]'))applyCurrent?.()});
 const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('uk-UA').trim();
 const isOn=d=>{const row=[...d.querySelectorAll('.ad-field')].find(x=>norm(x.textContent).includes('активна кампанія'));return !!row?.querySelector('input[type=checkbox]')?.checked};
 const dates=d=>{const inputs=[...d.querySelectorAll('input[type=datetime-local]')];return {start:inputs[0]?.value?new Date(inputs[0].value).getTime():0,end:inputs[1]?.value?new Date(inputs[1].value).getTime():0}};
 const state=d=>{if(!isOn(d))return 'paused';const t=dates(d),now=Date.now();if(t.end&&t.end<=now)return 'ended';if(t.start&&t.start>now)return 'scheduled';return 'active'};
 function enhance(){
  const panel=[...root.querySelectorAll('.ad-panel')].find(x=>norm(x.querySelector(':scope > h3')?.textContent)==='рекламні кампанії');
  if(!panel)return;
  const cards=[...panel.querySelectorAll(':scope > .ad-campaign')];if(!cards.length)return;
  let tools=panel.querySelector(':scope > .ad-campaign-tools');
  if(tools)return;
  if(!tools){
   tools=document.createElement('div');tools.className='ad-campaign-tools';
   const search=document.createElement('input');search.type='search';search.placeholder='Пошук за назвою або описом';search.setAttribute('aria-label','Пошук рекламних кампаній');search.value=query;
   search.addEventListener('input',()=>{query=search.value;apply()});
   const filter=document.createElement('select');filter.setAttribute('aria-label','Фільтр за статусом');
   for(const [v,l] of [['all','Усі кампанії'],['active','Активні'],['scheduled','Заплановані'],['paused','Вимкнені'],['ended','Завершені']]){const o=document.createElement('option');o.value=v;o.textContent=l;filter.append(o)}
   filter.value=status;filter.addEventListener('change',()=>{status=filter.value;apply()});
   const ordering=document.createElement('select');ordering.setAttribute('aria-label','Сортування кампаній');
   for(const [v,l] of [['default','Початковий порядок'],['name','За назвою А-Я'],['active','Спочатку активні']]){const o=document.createElement('option');o.value=v;o.textContent=l;ordering.append(o)}
   ordering.value=sort;ordering.addEventListener('change',()=>{sort=ordering.value;apply()});
   const count=document.createElement('small');count.className='ad-campaign-count';count.setAttribute('aria-live','polite');
   tools.append(search,filter,ordering,count);panel.insertBefore(tools,cards[0]);
  }
  apply();
  function apply(){
   const current=[...panel.querySelectorAll(':scope > .ad-campaign')];
   const decorated=current.map((node,index)=>{if(!node.dataset.adOriginalOrder)node.dataset.adOriginalOrder=String(index);return {node,index:Number(node.dataset.adOriginalOrder),title:norm(node.querySelector('summary')?.textContent),body:norm(node.querySelector('.ad-campaign-body')?.textContent),state:state(node)}});
   let visible=decorated.filter(x=>(!query||(x.title+' '+x.body).includes(norm(query)))&&(status==='all'||x.state===status));
   if(sort==='default')visible.sort((a,b)=>a.index-b.index);
   if(sort==='name')visible.sort((a,b)=>a.title.localeCompare(b.title,'uk'));
   if(sort==='active')visible.sort((a,b)=>({active:0,scheduled:1,paused:2,ended:3}[a.state]-({active:0,scheduled:1,paused:2,ended:3}[b.state])||a.index-b.index));
   const ordered=[...visible,...decorated.filter(x=>!visible.includes(x))];
   const anchor=panel.querySelector(':scope > .ad-templates-panel')||panel.querySelector(':scope > button');
   for(const x of ordered){x.node.hidden=!visible.includes(x);panel.insertBefore(x.node,anchor)}
   const count=tools.querySelector('.ad-campaign-count');if(count)count.textContent='Показано '+visible.length+' із '+current.length+' кампаній';
  }
  applyCurrent=apply;
 }
 const observer=new MutationObserver(()=>{if(root.isConnected)enhance()});
 observer.observe(root,{childList:true,subtree:true});
 enhance();
})();
