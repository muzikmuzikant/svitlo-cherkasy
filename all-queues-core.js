/* Read-only helper for showing all 12 confirmed subqueues on the same minute-accurate day. */
(function(root,factory){
 const api=factory();
 root.SvitloAllQueuesMath=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const QUEUES=Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat();
 const LABEL={0:'Світло за графіком',1:'Планове відключення','-1':'Немає підтверджених даних'};
 function hourSegments(timeline,hour){
  if(!timeline||timeline.length!==1440||!Number.isInteger(hour)||hour<0||hour>=24)
   return [{start:0,end:60,state:-1}];
  const result=[];
  const at=hour*60;
  let start=0,prev=timeline[at];
  for(let i=1;i<=60;i++){
   const next=i===60?null:timeline[at+i];
   if(i===60||next!==prev){
    result.push({start,end:i,state:[0,1].includes(prev)?prev:-1});
    start=i;prev=next;
   }
  }
  return result;
 }
 function allDaySegments(timeline){
  if(!timeline||timeline.length!==1440)return [{start:0,end:1440,state:-1}];
  const result=[];
  let start=0,prev=timeline[0];
  for(let i=1;i<=1440;i++){
   const next=i===1440?null:timeline[i];
   if(i===1440||next!==prev){
    result.push({start,end:i,state:[0,1].includes(prev)?prev:-1});
    start=i;prev=next;
   }
  }
  return result;
 }
 const time=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
 const describe=(parts,hour)=>parts.map(p=>time(hour*60+p.start)+'–'+time(hour*60+p.end)+': '+LABEL[p.state]).join('; ');
 const safeDate=date=>/^20\d{2}-\d{2}-\d{2}$/.test(date)&&
  !Number.isNaN(Date.parse(date+'T12:00:00Z'))&&
  new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
 return {QUEUES,LABEL,hourSegments,allDaySegments,time,describe,safeDate};
});
