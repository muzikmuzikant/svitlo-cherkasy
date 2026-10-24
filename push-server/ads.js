/* Isolated advertising, voluntary support and PWA analytics.
 * All durable files remain on isolated Railway volume. Never store IP/UA/address.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,n=200)=>String(v??'').trim().slice(0,n);
const clamp=(v,min,max,def)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):def;
const url=v=>{const s=text(v,500);try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')?u.href:''}catch{return ''}};
const contactUrl=v=>{const s=text(v,500);if(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s)||/^tel:\+?[0-9][0-9 -]{5,15}$/.test(s))return s;return url(s)};
const color=(v,def)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):def;
const when=v=>{const s=text(v,35);return !s?'':Number.isFinite(Date.parse(s))?new Date(s).toISOString():''};
const kinds=['iPhone','iPad','Android','Windows','macOS','Linux','Інше'];
const defaults={
 enabled:false,pageVisible:true,rotationSeconds:8,promoEvery:4,showPromo:true,manualSwipe:true,animation:'fade',
 promoTitle:'Тут може бути ваша реклама',promoText:'Розкажіть про свій бізнес користувачам «Світло Черкаси»',
 contactLabel:'Зв’язатися з нами',pageTitle:'Реклама у Світло Черкаси',
 pageIntro:'Невелике рекламне оголошення на головній сторінці застосунку. Обговорімо умови розміщення.',
 pageBackground:'#f5f8ff',pageAccent:'#377cff',pageHeroImage:'',pageAbout:'Реклама залишається компактною, не закриває графіки та не потрапляє у push-сповіщення.',
 pageContactText:'Напишіть нам, щоб обговорити формат, термін і вартість розміщення.',
 pageBenefits:['Локальна аудиторія Черкас і району','Ненав’язлива реклама на головній','Зрозуміла статистика показів і переходів'],

 pageTerms:'Умови та тривалість розміщення погоджуються індивідуально.',
 contacts:[],packages:[],campaigns:[],support:{
 enabled:false,title:'Підтримати Світло Черкаси',description:'Добровільна підтримка розвитку проєкту.',
 provider:'',paymentUrl:'',button:'Підтримати',details:'',
  heroImage:'',background:'#f5f8ff',accent:'#377cff',methods:[],expenses:[],
  whyTitle:'Навіщо потрібна підтримка?',thanksTitle:'Дякуємо, що допомагаєте розвивати сервіс',showGoals:true,showThanks:true,
  goals:[{icon:'🛡️',title:'Стабільність',description:'Підтримка доступності та оновлення даних.'},
   {icon:'🚀',title:'Розвиток',description:'Нові функції та виправлення помилок.'},
   {icon:'✨',title:'Нові можливості',description:'Тестування і покращення інтерфейсу.'}]

 }
};
function normalize(raw){
 const s=isObj(raw)?raw:{},su=isObj(s.support)?s.support:{};
 const contacts=Array.isArray(s.contacts)?s.contacts.slice(0,20):[];
 const packages=Array.isArray(s.packages)?s.packages.slice(0,40):[];
 const campaigns=Array.isArray(s.campaigns)?s.campaigns.slice(0,80):[];
 const normalized={
 enabled:s.enabled===true,pageVisible:s.pageVisible!==false,rotationSeconds:clamp(s.rotationSeconds,3,60,8),promoEvery:clamp(s.promoEvery,1,20,4),
 showPromo:s.showPromo!==false,manualSwipe:s.manualSwipe!==false,
 animation:['fade','slide','none'].includes(s.animation)?s.animation:'fade',
 promoTitle:text(s.promoTitle||defaults.promoTitle,100),promoText:text(s.promoText||defaults.promoText,240),
 contactLabel:text(s.contactLabel||defaults.contactLabel,70),pageTitle:text(s.pageTitle||defaults.pageTitle,120),
 pageIntro:text(s.pageIntro||defaults.pageIntro,750),pageTerms:text(s.pageTerms||defaults.pageTerms,1200),
 pageBackground:color(s.pageBackground,'#f5f8ff'),pageAccent:color(s.pageAccent,'#377cff'),
 pageHeroImage:url(s.pageHeroImage),pageAbout:text(s.pageAbout||defaults.pageAbout,1800),
 pageContactText:text(s.pageContactText||defaults.pageContactText,700),
 pageBenefits:(Array.isArray(s.pageBenefits)?s.pageBenefits:defaults.pageBenefits).slice(0,8).map(v=>text(v,180)).filter(Boolean),

 contacts:contacts.map(c=>({id:text(c.id,50)||crypto.randomUUID(),label:text(c.label,70),url:contactUrl(c.url),enabled:c.enabled!==false})).filter(c=>c.label),
 packages:packages.map(p=>({
   id:text(p.id,50)||crypto.randomUUID(),title:text(p.title,100),description:text(p.description,550),
   price:clamp(p.price,0,100000000,0),durationDays:clamp(p.durationDays,1,3650,30),visible:p.visible!==false,
   badge:text(p.badge,32),badgeBackground:color(p.badgeBackground,'#e5f1ff'),badgeForeground:color(p.badgeForeground,'#1456b5'),
   featured:p.featured===true,features:(Array.isArray(p.features)?p.features:[]).slice(0,12).map(x=>text(x,130)).filter(Boolean)
 })).filter(p=>p.title),
 campaigns:campaigns.map(c=>{
  const start=when(c.start),end=when(c.end),days=Array.isArray(c.days)?c.days.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6):[];
  if(start&&end&&start>=end)throw Error('Дата завершення реклами має бути пізнішою за початок');
  return {id:/^[a-zA-Z0-9_-]{1,50}$/.test(c.id||'')?c.id:crypto.randomUUID(),
   title:text(c.title,100),description:text(c.description,250),image:url(c.image),link:url(c.link),
   button:text(c.button||'Дізнатися більше',70),background:color(c.background,'#ffffff'),
   cardBackgroundImage:url(c.cardBackgroundImage),cardStyle:['soft','outline','dark'].includes(c.cardStyle)?c.cardStyle:'soft',
   detailEnabled:c.detailEnabled===true,detailTitle:text(c.detailTitle,130),
   detailSubtitle:text(c.detailSubtitle,240),detailDescription:text(c.detailDescription,6500),
   detailBanner:url(c.detailBanner),detailImage:url(c.detailImage),
   detailBackground:color(c.detailBackground,'#f5f8ff'),detailForeground:color(c.detailForeground,'#172c49'),
   detailAccent:color(c.detailAccent,'#377cff'),detailButton:text(c.detailButton||'Перейти на сайт',80),

   foreground:color(c.foreground,'#142338'),enabled:c.enabled===true,
   start,end,days:[...new Set(days)],weight:clamp(c.weight,1,10,1),
   seconds:clamp(c.seconds,3,60,8),maxImpressions:clamp(c.maxImpressions,0,100000000,0),
   dailyCap:clamp(c.dailyCap,0,1000000,0),
   price:clamp(c.price,0,100000000,0),paid:c.paid===true,note:text(c.note,500)}
 }),
 support:{
  enabled:su.enabled===true,title:text(su.title||defaults.support.title,100),
  description:text(su.description||defaults.support.description,500),
  provider:text(su.provider,80),paymentUrl:url(su.paymentUrl),
  button:text(su.button||'Підтримати',70),details:text(su.details,1100),
  heroImage:url(su.heroImage),background:color(su.background,'#f5f8ff'),
  accent:color(su.accent,'#377cff'),
  whyTitle:text(su.whyTitle||defaults.support.whyTitle,110),
  thanksTitle:text(su.thanksTitle||defaults.support.thanksTitle,170),
  showGoals:su.showGoals!==false,showThanks:su.showThanks!==false,
  methods:(Array.isArray(su.methods)?su.methods:[]).slice(0,12).map(m=>({
   id:text(m.id,50)||crypto.randomUUID(),kind:['monobank','iban','bank','other'].includes(m.kind)?m.kind:'other',
   title:text(m.title,100),description:text(m.description,350),url:url(m.url),
   details:text(m.details,240),icon:text(m.icon,8),background:color(m.background,'#ffffff'),
   foreground:color(m.foreground,'#172c49'),enabled:m.enabled!==false
  })).filter(m=>m.title),
  expenses:(Array.isArray(su.expenses)?su.expenses:[]).slice(0,30).map(e=>({
   id:text(e.id,50)||crypto.randomUUID(),title:text(e.title,120),amount:clamp(e.amount,0,100000000,0),
   date:text(e.date,10),description:text(e.description,300),public:e.public===true
  })).filter(e=>e.title),

  goals:(Array.isArray(su.goals)?su.goals:defaults.support.goals).slice(0,6).map(g=>({
   icon:text(g.icon,6),title:text(g.title,100),description:text(g.description,350)
  })).filter(g=>g.title)

 }
 };
 const ids=normalized.campaigns.map(c=>c.id);
 if(new Set(ids).size!==ids.length)throw Error('ID рекламних оголошень повинні бути унікальними');
 return normalized;
}

const BETA_ORIGIN='https://svitlo-cherkasy.pages.dev';
const PRODUCTION_ORIGIN='https://svitlo-cherkasy.pp.ua';
// Both installed PWA origins have their own authenticated Railway admin and storage.
export function createAdsStore({directory,clock=()=>Date.now(),appOrigin=String(process.env.APP_ORIGIN||'').replace(/\/+$/,''),commercialAllowed=[BETA_ORIGIN,PRODUCTION_ORIGIN].includes(appOrigin)}){
 const productionMode=appOrigin===PRODUCTION_ORIGIN;
 const file=path.join(directory,'beta-ads.json');
 const visitorsFile=path.join(directory,'beta-pwa-installations.json');
 const stateDefault=normalize(defaults);
 let state=stateDefault,stats={},installed={},lastModified=null;
 const online=new Map(),rate=new Map(),recentAdViews=new Map();
 let timer=null,visitorTimer=null;
 function write(dest,data){fs.mkdirSync(directory,{recursive:true});const tmp=dest+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,dest)}
 function flush(){if(timer){clearTimeout(timer);timer=null}write(file,{schemaVersion:3,state,stats,lastModified})}
 function flushVisitors(){if(visitorTimer){clearTimeout(visitorTimer);visitorTimer=null}write(visitorsFile,{schemaVersion:1,installed})}
 function schedule(){if(!timer){timer=setTimeout(flush,900);timer.unref?.()}}
 function scheduleVisitors(){if(!visitorTimer){visitorTimer=setTimeout(flushVisitors,4000);visitorTimer.unref?.()}}
 try{
  const old=JSON.parse(fs.readFileSync(file,'utf8'));
  state=normalize(old.state);stats=isObj(old.stats)?old.stats:{};lastModified=old.lastModified||null;
  // Historical Production drafts could be enabled but were never shown.
  // Require a NEW explicit owner choice after upgrade before first ad.
  if(productionMode&&Number(old.schemaVersion||0)<3){
   state.enabled=false;
   write(file,{schemaVersion:3,state,stats,lastModified});
  }
 }catch(e){if(e.code!=='ENOENT')console.warn('[ads] Config load failed',e.message)}
 try{const old=JSON.parse(fs.readFileSync(visitorsFile,'utf8'));installed=isObj(old.installed)?old.installed:{}}catch(e){if(e.code!=='ENOENT')console.warn('[beta-ads] Visitor store reset',e.message)}
 function prune(){const now=clock(),cut=now-60*86400000,dayCut=new Date(now-90*86400000).toISOString().slice(0,10);
  for(const [id,v] of Object.entries(installed))if(!v||!Number.isFinite(v.at)||v.at<cut)delete installed[id];
  for(const [id,t] of online)if(now-t>45000)online.delete(id);
  for(const k of Object.keys(stats))if(k.split('|').at(-1)<dayCut)delete stats[k];
  for(const [k,t] of rate)if(now-t.last>120000)rate.delete(k);
  for(const [k,t] of recentAdViews)if(now-t>120000)recentAdViews.delete(k);
 }
 function totals(id,day){let all=0,today=0,clicks=0;
  for(const [key,v] of Object.entries(stats))if(key.startsWith(id+'|')){
   all+=Number(v.impressions)||0;clicks+=Number(v.clicks)||0;
   if(key.endsWith('|'+day))today=Number(v.impressions)||0;
  }return {all,today,clicks}}
 function publicState(){
  // Owner-controlled advertising on both origins; voluntary support is separate.
  // Only expose payment destinations when the operator explicitly enabled support.
  const supportMethods=state.support.methods.filter(m=>m.enabled&&!!(m.url||m.details));
  const supportEnabled=state.support.enabled&&!!(state.support.paymentUrl||supportMethods.length);
  const support=supportEnabled?{...state.support,enabled:true,methods:supportMethods,
   expenses:state.support.expenses.filter(e=>e.public)}:
   {...state.support,enabled:false,methods:[],expenses:[],paymentUrl:'',details:'',provider:''};
  if(!commercialAllowed)return {enabled:false,campaigns:[],contacts:[],packages:[],support};
  const now=new Date(clock()).toISOString(),day=now.slice(0,10),weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',weekday:'short'}).format(new Date(clock())));
  return {enabled:commercialAllowed&&state.enabled,pageVisible:state.pageVisible,rotationSeconds:state.rotationSeconds,promoEvery:state.promoEvery,
   showPromo:state.showPromo,manualSwipe:state.manualSwipe,animation:state.animation,
   promoTitle:state.promoTitle,promoText:state.promoText,contactLabel:state.contactLabel,
   pageTitle:state.pageTitle,pageIntro:state.pageIntro,pageTerms:state.pageTerms,
   pageBackground:state.pageBackground,pageAccent:state.pageAccent,pageHeroImage:state.pageHeroImage,
   pageAbout:state.pageAbout,pageContactText:state.pageContactText,pageBenefits:state.pageBenefits,
   contacts:(commercialAllowed?state.contacts:[]).filter(c=>c.enabled&&c.url).map(({label,url})=>({label,url})),
   packages:(commercialAllowed?state.packages:[]).filter(p=>p.visible).map(({title,description,price,durationDays,badge,badgeBackground,badgeForeground,featured,features})=>({title,description,price,durationDays,badge,badgeBackground,badgeForeground,featured,features})),
   support,
   campaigns:commercialAllowed&&state.enabled?state.campaigns.filter(c=>{
    if(!c.enabled||!c.title||c.start&&c.start>now||c.end&&c.end<=now)return false;
    if(c.days.length&&!c.days.includes(weekday))return false;
    const t=totals(c.id,day);return (!c.maxImpressions||t.all<c.maxImpressions)&&(!c.dailyCap||t.today<c.dailyCap);
   }).map(({id,title,description,image,link,button,background,foreground,weight,seconds,cardBackgroundImage,cardStyle,detailEnabled,detailTitle,detailSubtitle,detailDescription,detailBanner,detailImage,detailBackground,detailForeground,detailAccent,detailButton})=>
    ({id,title,description,image,link,button,background,foreground,weight,seconds,cardBackgroundImage,cardStyle,
     detailEnabled,detailTitle,detailSubtitle,detailDescription,detailBanner,detailImage,detailBackground,detailForeground,detailAccent,detailButton})):[]};
 }
 function update(value){if(!isObj(value))throw Error('Некоректні налаштування');state=normalize(value);lastModified=new Date(clock()).toISOString();flush();return dashboard()}
 function rateLimit(bucket,limit,windowMs){const now=clock(),r=rate.get(bucket);if(!r||now-r.last>=windowMs){rate.set(bucket,{last:now,count:1});return true}r.count++;return r.count<=limit}
 function event(id,type,clientKey=''){
  if(!commercialAllowed||!['impression','click','detailOpen','outbound'].includes(type)||!state.enabled)return false;
  if(id!=='promo'&&!publicState().campaigns.some(c=>c.id===id))return false;
  if(clientKey&&!rateLimit('ad:'+clientKey,150,60000))return false;
  const now=clock(),day=new Date(now).toISOString().slice(0,10),k=id+'|'+day;
  if(clientKey&&type==='impression'){const dedupe=id+'|'+clientKey;if(now-(recentAdViews.get(dedupe)||0)<2000)return true;recentAdViews.set(dedupe,now)}
  const s=stats[k]??={impressions:0,clicks:0,detailOpens:0,outboundClicks:0};
  s[({impression:'impressions',click:'clicks',detailOpen:'detailOpens',outbound:'outboundClicks'})[type]]++;
  schedule();return true;
 }
 function activity(data){
  if(!isObj(data)||data.mode!=='standalone'||data.consent!==true)return false;
  const id=text(data.id,64);if(!/^[0-9a-f]{8}-[0-9a-f-]{27,56}$/i.test(id))return false;
  const now=clock(),key=crypto.createHash('sha256').update('beta-install:'+id).digest('hex');
  prune();online.set(key,now);
  const old=installed[key];
  const queue=typeof data.queue==='string'&&/^[1-6]\.[12]$/.test(data.queue)?data.queue:null;
  const rawTown=typeof data.locality==='string'?data.locality.normalize('NFKC').trim().replace(/\s+/g,' '):'';
  const locality=/^[\p{L}][\p{L} .'’\-]{1,54}$/u.test(rawTown)?rawTown:null;
  const version=typeof data.version==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(data.version)?data.version:null;
  installed[key]={at:now,first:old?.first||now,platform:kinds.includes(data.platform)?data.platform:'Інше',
   queue,locality,version};
  scheduleVisitors();return true;
 }
 function optOut(data){
  const id=text(data?.id,64);if(!/^[0-9a-f]{8}-[0-9a-f-]{27,56}$/i.test(id))return false;
  const key=crypto.createHash('sha256').update('beta-install:'+id).digest('hex');
  online.delete(key);delete installed[key];scheduleVisitors();return true;
 }
 // Group only distinct opt-in installation hashes, never raw open events.
 // Historic installation rows missing queue/version stay unattributed.
 function audiencePeriod(rows){
  const result={known:rows.length};
  for(const [field,name] of [['queue','queues'],['locality','localities'],['platform','platforms'],['version','versions']]){
   const counts=new Map();
   for(const [,entry] of rows){
    const value=entry?.[field];
    if(typeof value==='string'&&value)counts.set(value,(counts.get(value)||0)+1);
   }
   const total=[...counts.values()].reduce((a,b)=>a+b,0);
   const all=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'uk'));
   const visible=(field==='locality'?all.filter(([,count])=>count>=5):all).slice(0,15);
   result[name]={
    items:visible.map(([label,count])=>({label,count,percent:total?Number((100*count/total).toFixed(1)):0})),
    total,unknown:rows.length-total,
    other:total-visible.reduce((n,[,count])=>n+count,0)
   };
  }
  return result;
 }
 function dashboard(){
  prune();const now=clock(),keys=Object.entries(installed),
  audience48=audiencePeriod(keys.filter(([,v])=>now-v.at<48*3600000)),
  audience7=audiencePeriod(keys.filter(([,v])=>now-v.at<7*86400000)),
  audience30=audiencePeriod(keys.filter(([,v])=>now-v.at<30*86400000)),pwa={
   online:online.size,known:keys.length,active24h:keys.filter(([,v])=>now-v.at<86400000).length,
   active7d:keys.filter(([,v])=>now-v.at<7*86400000).length,
   active30d:keys.filter(([,v])=>now-v.at<30*86400000).length,
   new7d:keys.filter(([,v])=>now-v.first>=now-7*86400000).length,
   byPlatform:Object.fromEntries(kinds.map(k=>[k,keys.filter(([,v])=>v.platform===k).length])),
   audience48,audience7,audience30,
   note:'Унікальні встановлені PWA зі згодою, а не точна кількість фізичних осіб. Старі лічильники подій не конвертуються в інсталяції.'
  };
  const totals={},daily={};
  for(const [key,s] of Object.entries(stats)){
   const sep=key.lastIndexOf('|'),id=key.slice(0,sep),day=key.slice(sep+1);
   const dst=totals[id]??={impressions:0,clicks:0,detailOpens:0,outboundClicks:0};
   dst.impressions+=Number(s.impressions)||0;dst.clicks+=Number(s.clicks)||0;dst.detailOpens+=Number(s.detailOpens)||0;dst.outboundClicks+=Number(s.outboundClicks)||0;
   const d=daily[day]??={impressions:0,clicks:0};
   d.impressions+=Number(s.impressions)||0;d.clicks+=Number(s.clicks)||0;
  }
  return {settings:state,stats:totals,statsByCampaignDay:stats,daily,pwa,lastModified,commercialLocked:!commercialAllowed};
 }
 return {publicState,update,event,activity,optOut,dashboard,flush,flushVisitors};
}
