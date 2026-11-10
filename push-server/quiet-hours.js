const QUEUES = Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat();
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
export function normalizeQuietHours(input){
 if(!Array.isArray(input)||input.length>14)throw Error('Неприпустимі тихі години');
 const seen=new Set(),out=[];
 for(const item of input){
  const day=Number(item?.day),slot=Number(item?.slot),start=String(item?.start||''),end=String(item?.end||'');
  if(!Number.isInteger(day)||day<0||day>6||!Number.isInteger(slot)||slot<0||slot>1||!TIME.test(start)||!END_TIME.test(end)||start>=end)throw Error('Невірний інтервал тихих годин');
  const key=day+':'+slot;if(seen.has(key))throw Error('Повторний інтервал');seen.add(key);out.push({day,slot,start,end});
 }
 return out.sort((a,b)=>a.day-b.day||a.slot-b.slot);
}
export function isQuietForRecord(record,date,minute){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isInteger(minute)||minute<0||minute>=1440)return false;
 const day=new Date(date+'T12:00:00Z').getUTCDay(),now=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
 return (Array.isArray(record?.quietHours)?record.quietHours:[]).some(x=>x.day===day&&x.start<=now&&now<x.end);
}