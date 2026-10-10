/* Minute-accurate cell paints and masks. Source of truth: 1440-minute schedule. */
(function(root){
 'use strict';
 const COLOR={0:'#f7fafc',1:'#29384f','-1':'#eaf0f7'};
 function segments(timeline,hour){
   const at=hour*60;
   if(!timeline||!Number.isInteger(hour)||hour<0||hour>23)return [];
   const parts=[];let start=0,state=timeline[at];
   for(let minute=1;minute<=60;minute++){
     const next=minute<60?timeline[at+minute]:null;
     if(minute===60||next!==state){parts.push({start,end:minute,state});start=minute;state=next;}
   }
   return parts;
 }
 function gradient(parts,colors){
   if(!parts.length)return colors[-1];
   return 'linear-gradient(90deg, '+parts.flatMap(p=>[
     `${colors[p.state]??colors[-1]} ${(p.start/60*100).toFixed(4)}%`,
     `${colors[p.state]??colors[-1]} ${(p.end/60*100).toFixed(4)}%`
   ]).join(', ')+')';
 }
 function inkMask(parts,mode){
   if(!parts.length)return 'linear-gradient(90deg, transparent, transparent)';
   const colors={0:mode===0?'#000':'transparent',1:mode===1?'#000':'transparent','-1':mode===-1?'#000':'transparent'};
   return gradient(parts,colors);
 }
 function paintHour(timeline,hour){
   const parts=segments(timeline,hour);
   if(!parts.length)return {kind:'unknown',parts:[],background:COLOR[-1],onMask:inkMask([],0),offMask:inkMask([],1),unknownMask:inkMask([], -1)};
   const kind=parts.length===1?(parts[0].state===1?'off':parts[0].state===0?'on':'unknown'):'mixed';
   return {kind,parts,background:gradient(parts,COLOR),onMask:inkMask(parts,0),offMask:inkMask(parts,1),unknownMask:inkMask(parts,-1)};
 }
 root.SvitloHour={paintHour,segments};
 if(typeof module!=='undefined'&&module.exports)module.exports={paintHour,segments};
})(typeof window!=='undefined'?window:globalThis);
