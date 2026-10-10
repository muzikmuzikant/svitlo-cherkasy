/* Standalone hour-color renderer: supports partial outages starting or ending at any minute. */
(function (root) {
  'use strict';
  const COLOR = {0:'#e0f5e7', 1:'#2c3c54', '-1':'#f2f4f8'};
  function paintHour(timeline, hour) {
    const start=hour*60;
    if(!timeline || start<0 || start>=1440) return {kind:'unknown',background:COLOR[-1],parts:[]};
    const parts=[];
    let s=0, value=timeline[start];
    for(let i=1;i<=60;i++){
      const next=i<60?timeline[start+i]:null;
      if(i===60 || next!==value){parts.push({start:s,end:i,state:value});s=i;value=next;}
    }
    const kind=parts.length===1?(parts[0].state===1?'off':parts[0].state===0?'on':'unknown'):'mixed';
    const stops=parts.flatMap(p=>[`${COLOR[p.state] ?? COLOR[-1]} ${(p.start/60*100).toFixed(4)}%`,`${COLOR[p.state] ?? COLOR[-1]} ${(p.end/60*100).toFixed(4)}%`]);
    return {kind,parts,background:`linear-gradient(90deg, ${stops.join(', ')})`};
  }
  root.SvitloHour={paintHour};
  if(typeof module!=='undefined'&&module.exports)module.exports={paintHour};
})(typeof window!=='undefined'?window:globalThis);
