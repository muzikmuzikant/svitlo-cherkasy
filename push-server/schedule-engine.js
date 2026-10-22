/** Pure, testable schedule/push rules. Unknown history is never assumed to be power-on. */
export const QUEUES = new Set(Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat());
export const parseMinute = value => value === '24:00' ? 1440 : /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : -1;
export function timeline(day, queue) {
  if (!QUEUES.has(queue) || day?.verified !== true) return null;
  const entry=day.queues?.[queue];
  // In a verified complete official daily publication, omitted queues have
  // no declared planned outages (they are NOT unverified house addresses).
  if(!entry)return new Int8Array(1440);
  if(!Array.isArray(entry.off))return null;
  const start=parseMinute(entry.knownFrom ?? '00:00');if(start<0)return null;
  const values=new Int8Array(1440);values.fill(-1);values.fill(0,start,1440);
  let last=0;
  for(const interval of entry.off){
    if(!Array.isArray(interval)||interval.length!==2)return null;
    const from=parseMinute(interval[0]),to=parseMinute(interval[1]);
    if(from<last||from<0||from>=to||to>1440)return null;
    values.fill(1,Math.max(from,start),to);last=to;
  }
  return values;
}
/** Returns a reminder transition within a modest dispatch grace window (job/server delays). */
export function dueTransition(values, now, offset, target, grace=3) {
  if (!values || !Number.isInteger(now) || now<0 || now>=1440) return null;
  for(let eta=offset;eta>=Math.max(0,offset-grace);eta--){
    const boundary=now+eta;
    if(boundary<1||boundary>=1440)continue;
    if(values[boundary]===target && values[boundary-1]!==target && values[boundary-1]!==-1)return boundary;
  }
  return null;
}
/** An older 'active' article must not override a newer 'ended' or 'notice'. */
export function latestOfficialEvent(events, now=Date.now(), maxAge=24*3600_000){
  if(!Array.isArray(events))return null;
  return events.filter(e=>e && ['active','ended','notice'].includes(e.status) &&
     typeof e.source==='string' && /^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//i.test(e.source) &&
     Number.isFinite(Date.parse(e.publishedAt)) && Date.parse(e.publishedAt)<=now+60000 &&
     now-Date.parse(e.publishedAt)<maxAge)
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0]||null;
}
export function freshEvent(event,now=Date.now(),maxAge=65*60_000){
 if(!event)return false;const age=now-Date.parse(event.publishedAt);return age>=0&&age<maxAge;
}

/** Suppress scheduled Push if GitHub import stopped or source needs review. */
export function freshSchedule(doc,now=Date.now(),maxAge=55*60_000){
 if(!doc||!Array.isArray(doc.days)||doc.reviewPending===true)return false;
 const stamp=Date.parse(doc.lastChecked||'');
 return Number.isFinite(stamp)&&stamp<=now+5*60_000 && now-stamp<=maxAge;
}
/**
 * A source-review warning can affect one calendar date while other verified
 * dates remain safe. The importer records those blocked dates explicitly.
 * Do not treat the global reviewPending audit flag as a global Push mute.
 */
export function usableSchedule(doc,now=Date.now(),maxAge=55*60_000){
 if(!doc)return false;
 if(doc.reviewPending===true&&(!Array.isArray(doc.unresolvedDates)||!doc.unresolvedDates.length))return false;
 return freshSchedule({...doc,reviewPending:false},now,maxAge);
}
/** Only use independently verified dates that have no unresolved publication. */
export function verifiedScheduleDay(doc,date,now=Date.now()){
 if(!usableSchedule(doc,now)||typeof date!=='string'||doc.unresolvedDates?.includes(date))return null;
 return doc.days.find(day=>day?.date===date&&day.verified===true)||null;
}
/**
 * Prefer the newest usable snapshot (publisher or cached fallback).
 * A stale Railway import should not shadow a newer verified fallback.
 */
export function preferFreshSchedule(primary,fallback,now=Date.now()){
 const candidates=[primary,fallback].filter(doc=>usableSchedule(doc,now));
 if(!candidates.length)return primary||fallback||null;
 return candidates.sort((a,b)=>Date.parse(b.lastChecked)-Date.parse(a.lastChecked))[0];
}
/** Reminders for 00:00–00:30 tomorrow must be visible before midnight. */
export function dueTransitionAcrossDays(today,tomorrow,now,offset,target,grace=4){
 for(let eta=offset;eta>=Math.max(0,offset-grace);eta--){
  const pos=now+eta;
  if(pos<1||pos>=2880)continue;
  const next=pos>=1440;
  const value=next?tomorrow?.[pos-1440]:today?.[pos];
  const previous=pos-1>=1440?tomorrow?.[pos-1441]:today?.[pos-1];
  if(value===target&&previous!==undefined&&previous!==-1&&previous!==target)return pos;
 }
 return null;
}
