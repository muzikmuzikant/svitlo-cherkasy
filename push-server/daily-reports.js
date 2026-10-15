/* Hourly refreshed, daily aggregate report snapshots for the beta admin. */
import fs from 'node:fs';
import path from 'node:path';
const dayInKyiv=stamp=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp);
export function createDailyReports({directory,clock=()=>new Date()}){
 const file=path.join(directory,'beta-daily-reports.json');let snapshots={};
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved&&typeof saved==='object'&&!Array.isArray(saved))snapshots=saved}catch(e){if(e.code!=='ENOENT')console.warn('Daily reports recovery:',e.message)}
 const save=()=>{fs.mkdirSync(directory,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(snapshots),{mode:0o600});fs.renameSync(tmp,file)};
 const capture=(sources)=>{
  const stamp=clock(),date=dayInKyiv(stamp);const feedback=sources.feedback?.list?.().items||[];
  const adBoard=sources.ads?.dashboard?.()||{};
  const campaigns=Object.values(adBoard.stats||{});
  const quality=sources.audit?.()||{ok:null,issues:[],days:null};
  const push=sources.push?.stats?.()||{};
  const diagnostics=sources.diagnostics?.report?.()||{};
  const report={
   date,generatedAt:stamp.toISOString(),
   feedback:{total:feedback.length,new:feedback.filter(v=>v.status==='new').length,inProgress:feedback.filter(v=>v.status==='in_progress').length,resolved:feedback.filter(v=>v.status==='resolved').length},
   subscriptions:Number.isFinite(push.subscribers)?push.subscribers:null,
   advertising:{impressions:campaigns.reduce((n,v)=>n+(Number(v.impressions)||0),0),clicks:campaigns.reduce((n,v)=>n+(Number(v.clicks)||0),0),campaigns:campaigns.length},
   pwa:{active24h:adBoard.pwa?.active24h??null,active7d:adBoard.pwa?.active7d??null},
   schedules:{days:quality.days??null,structuralErrors:(quality.issues||[]).filter(e=>e.level==='error').length},
   diagnostics:{errors45d:diagnostics.total??null}
  };
  snapshots[date]=report;
  const dates=Object.keys(snapshots).sort().reverse();for(const stale of dates.slice(60))delete snapshots[stale];
  save();return report
 };
 const list=()=>({items:Object.entries(snapshots).sort(([a],[b])=>b.localeCompare(a)).slice(0,60).map(([,v])=>v),note:'Автоматичні знімки агрегованих даних оновлюються щогодини. Показники реклами є накопиченими, а не доходами.'});
 return {capture,list}
}