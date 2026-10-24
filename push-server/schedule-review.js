/* Owner-reviewed exception to the automatic schedule importer.
 * Manual approval applies ONLY while the very same official publication is
 * unresolved. Once the source becomes readable or its fingerprint changes,
 * the automatic official plan takes precedence again.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const Q=Array.from({length:6},(_,i)=>[1,2].map(j=>String(i+1)+'.'+j)).flat();
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const OFFICIAL=/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\/media\/[A-Za-z0-9/_-]+(?:\?[^#]*)?$/i;
const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes=x=>x==='24:00'?1440:CLOCK.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):NaN;
function validateDay(value){
 if(typeof value!=='string'||!DAY.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Невірна дата');
 const age=Math.abs(Date.now()-Date.parse(value+'T12:00:00Z'));
 if(age>5*86400000)throw Error('Можна підтверджувати лише актуальні дати');
 return value;
}
function validateSlots(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==12||Object.keys(raw).some(q=>!Q.includes(q)))throw Error('Перевірте всі 12 підчерг');
 const queues={};
 for(const q of Q){
  const intervals=raw[q];
  if(!Array.isArray(intervals)||intervals.length>16)throw Error('Невірні інтервали для '+q);
  let previous=0;
  const off=intervals.map(v=>{
   if(!Array.isArray(v)||v.length!==2||typeof v[0]!=='string'||typeof v[1]!=='string')throw Error('Невірний інтервал '+q);
   const start=minutes(v[0]),end=minutes(v[1]);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<previous||start>=end||end>1440)throw Error('Інтервали '+q+' перетинаються або мають неправильний час');
   previous=end;
   return [v[0],v[1]];
  });
  queues[q]={knownFrom:'00:00',off};
 }
 return queues;
}
const digest=queues=>crypto.createHash('sha256').update(JSON.stringify(Q.map(q=>[q,queues[q].off]))).digest('hex').slice(0,20);
export function createScheduleReview({directory,clock=Date.now}){
 const file=path.join(directory,'schedule-manual-approvals.json');
 let approvals={};
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version===1&&saved.approvals&&typeof saved.approvals==='object')approvals=saved.approvals}
 catch(e){if(e.code!=='ENOENT')console.warn('[schedule-review] unreadable record',e.message)}
 function persist(){
  fs.mkdirSync(directory,{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify({version:1,approvals}),{mode:0o600});
  fs.renameSync(temp,file);
 }
 const issues=review=>Array.isArray(review?.items)?review.items.filter(x=>x&&typeof x.source==='string'):[];
 function issueFor(review,source,date){
  return issues(review).find(x=>x.source===source&&
   (!x.targetDate||x.targetDate===date||x.headlineDate===date));
 }
 function active(approval,review){
  if(!approval||!issueFor(review,approval.source,approval.date))return false;
  const issue=issueFor(review,approval.source,approval.date);
  // Importer supplies the source hash for newly detected unreadable articles.
  // A changed article must be reviewed again, not silently approved forever.
  if(issue.sourceHash)return approval.sourceHash===issue.sourceHash;
  // When the feed cannot supply a fingerprint, do not accept a previously
  // fingerprinted approval for a different or downgraded source response.
  return !approval.sourceHash;
 }
 function list(schedule,review){
  const days=Array.isArray(schedule?.days)?schedule.days:[];
  return {issues:issues(review),approvals:Object.values(approvals)
   .filter(x=>x&&typeof x.date==='string')
   .map(x=>({date:x.date,source:x.source,approvedAt:x.approvedAt,active:active(x,review),sourceHash:x.sourceHash||null,queues:x.queues})),
   days:days.map(x=>({date:x.date,source:x.source,queues:x.queues,verified:x.verified,publishedAt:x.publishedAt})),
   lastChecked:schedule?.lastChecked||null};
 }
 function approve(input,schedule,review){
  if(input?.confirmed!==true)throw Error('Підтвердьте звірку з офіційною публікацією');
  const date=validateDay(input.date);
  if(typeof input.source!=='string'||!OFFICIAL.test(input.source))throw Error('Потрібне посилання на офіційну новину');
  const issue=issueFor(review,input.source,date);
  if(!issue)throw Error('Таку публікацію вже розпізнано або її немає серед актуальних проблем');
  if(issue.sourceHash&&input.sourceHash!==issue.sourceHash)throw Error('Публікацію змінено. Оновіть перевірку');
  const queues=validateSlots(input.queues);
  approvals[date]={date,source:input.source,queues,sourceHash:issue.sourceHash||null,
   approvedAt:new Date(clock()).toISOString(),fingerprint:digest(queues)};
  persist();return {ok:true,date,approvedAt:approvals[date].approvedAt};
 }
 function revoke(date){validateDay(date);if(!approvals[date])throw Error('Для цієї дати немає ручного підтвердження');delete approvals[date];persist();return {ok:true,date}}
 function effective(schedule,review){
  if(!schedule||!Array.isArray(schedule.days))return {schedule,review};
  const doc=structuredClone(schedule),rev=structuredClone(review||{items:[],rejectedCount:0,warningCount:0});
  let resolved=0;const handled=new Set();
  for(const approval of Object.values(approvals)){
   if(!active(approval,review))continue;
   const issue=issueFor(review,approval.source,approval.date);
   const old=doc.days.find(d=>d.date===approval.date);
   // If automatic importer already found a newer valid article, it wins.
   if(old&&old.source!==approval.source&&Date.parse(old.publishedAt||'')>Date.parse(approval.approvedAt||''))continue;
   const day={date:approval.date,source:approval.source,publishedAt:approval.approvedAt,verified:true,
    queues:structuredClone(approval.queues),planFingerprint:approval.fingerprint,revisions:1,
    manualReview:true,publications:[{publishedAt:approval.approvedAt,source:approval.source,queues:Q}]};
   if(old)doc.days=doc.days.map(x=>x.date===approval.date?day:x);
   else doc.days.push(day);
   doc.days.sort((a,b)=>a.date.localeCompare(b.date));
   const changed=Q.filter(q=>JSON.stringify(old?.queues?.[q]?.off||[])!==JSON.stringify(day.queues[q].off));
   if(changed.length){
    doc.changes=Array.isArray(doc.changes)?doc.changes:[];
    if(!doc.changes.some(c=>c.date===day.date&&c.revisionId===day.planFingerprint))
     doc.changes.push({date:day.date,publishedAt:day.publishedAt,detectedAt:day.publishedAt,
      revisionId:day.planFingerprint,source:day.source,queues:changed});
    doc.changes=doc.changes.slice(-100);
   }
   doc.confirmedNoScheduleDates=(doc.confirmedNoScheduleDates||[]).filter(x=>x!==approval.date);
   doc.unresolvedDates=(doc.unresolvedDates||[]).filter(x=>x!==approval.date);
   handled.add(issue);resolved++;
  }
  if(resolved){
   rev.items=issues(rev).filter(item=>!issues(review).some(original=>handled.has(original)&&
    original.source===item.source&&original.code===item.code));
   rev.rejectedCount=rev.items.filter(x=>x.code==='HEADLINE_DATE_CONFLICT').length;
   rev.warningCount=rev.items.filter(x=>x.code!=='HEADLINE_DATE_CONFLICT').length;
   doc.reviewPending=rev.items.length>0||doc.unresolvedDates.length>0;
  }
  return {schedule:doc,review:rev};
 }
 return {list,approve,revoke,effective};
}
