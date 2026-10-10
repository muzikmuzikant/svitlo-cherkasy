/* Pure 30-minute schedule helpers for the admin panel. */
(function(root){
 'use strict';
 const at=index=>`${String(Math.floor(index/2)).padStart(2,'0')}:${index%2?'30':'00'}`;
 const indexOf=time=>{
  if(time==='24:00')return 48;
  const m=/^(\d\d):(00|30)$/.exec(String(time));
  const h=Number(m?.[1]);
  return m&&h<24?2*h+(m[2]==='30'?1:0):-1;
 };
 function fromIntervals(off){
  if(!Array.isArray(off))throw Error('Невірні інтервали');
  const slots=Array(48).fill(false);
  for(const interval of off){
   if(!Array.isArray(interval)||interval.length!==2)throw Error('Потрібні початок і кінець інтервалу');
   const begin=indexOf(interval[0]),end=indexOf(interval[1]);
   if(begin<0||end<=begin||end>48)throw Error('Конструктор підтримує інтервали з кроком 30 хвилин');
   for(let i=begin;i<end;i++){
    if(slots[i])throw Error('Інтервали перетинаються');
    slots[i]=true;
   }
  }return slots;
 }
 function toIntervals(slots){
  if(!Array.isArray(slots)||slots.length!==48||slots.some(v=>typeof v!=='boolean'))throw Error('Потрібно 48 півгодинних комірок');
  const result=[];let begin=-1;
  for(let i=0;i<=48;i++){
   if(i<48&&slots[i]&&begin<0)begin=i;
   if((i===48||!slots[i])&&begin>=0){result.push([at(begin),at(i)]);begin=-1}
  }return result;
 }
 root.SvitloSchedulePlanner={indexOf,at,fromIntervals,toIntervals};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SvitloSchedulePlanner;
})(typeof globalThis!=='undefined'?globalThis:this);
