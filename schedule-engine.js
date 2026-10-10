/** Pure, testable schedule/push rules. Unknown history is never assumed to be power-on. */
export const QUEUES = new Set(Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat());
export const parseMinute = value => value === '24:00' ? 1440 : /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : -1;
export function timeline(day, queue) {
  if (!QUEUES.has(queue) || day?.verified !== true) return null;
  const entry=day.queues?.[queue]; if(!entry || !Array.isArray(entry.off)) return null;
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
