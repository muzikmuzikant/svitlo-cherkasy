/* Manual schedule editor math: independent from DOM for regression tests. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SvitloSchedulePlanner=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const QUEUES=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
 function mins(t){if(t==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||''))throw Error('Некоректний час '+t);return +t.slice(0,2)*60 + +t.slice(3)}
 function tick(i){if(!Number.isInteger(i)||i<0||i>48)throw Error('Невірний інтервал');const m=i*30;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
 function slotsFromOff(off){const slots=Array(48).fill(false);let end=0;if(!Array.isArray(off))throw Error('Потрібен список інтервалів');for(const pair of off){if(!Array.isArray(pair)||pair.length!==2)throw Error('Неправильний інтервал');const a=mins(pair[0]),b=mins(pair[1]);if(a<end||a>=b||b>1440||a%30||b%30)throw Error('Інтервали мають бути кратні 30 хвилинам і не перетинатись');for(let i=a/30;i<b/30;i++)slots[i]=true;end=b;}return slots}
 function intervals(slots){if(!Array.isArray(slots)||slots.length!==48||slots.some(v=>typeof v!=='boolean'))throw Error('Потрібні 48 півгодинних клітинок');const result=[];let start=-1;for(let i=0;i<=48;i++){if(i<48&&slots[i]&&start<0)start=i;if((i===48||!slots[i])&&start>=0){result.push([tick(start),tick(i)]);start=-1}}return result}
 function fullDay(day){return !!(day&&day.verified===true&&(day.complete===true||day.queues&&QUEUES.every(q=>day.queues[q]&&Array.isArray(day.queues[q].off))))}
 return {QUEUES,mins,tick,slotsFromOff,intervals,fullDay};
});
