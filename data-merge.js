/* Live official queues take precedence. Preserve old street names when official
 * importer returns a partial district list, but never auto-apply old queues. */
(function(root, factory){
 const api=factory();
 if(typeof module==='object' && module.exports) module.exports=api;
 else root.SvitloDataMerge=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
 'use strict';
 const obj=v=>v && typeof v==='object' && !Array.isArray(v)?v:{};
 const valid=v=>Array.isArray(v)?[...new Set(v.filter(q=>/^[1-6]\.[12]$/.test(q)))].sort((a,b)=>Number(a)-Number(b)):[];
 const hasContent=idx=>!!(Object.keys(obj(idx.keys)).length||Object.keys(obj(idx.streets)).length||Object.keys(obj(idx.streetQueues)).length);
 function mergeIndexes(current, historical, {manual=false}={}){
   const live=obj(current), backup=obj(historical);
   function combine(a,b){
     a=obj(a);b=obj(b);
     // A partial official update must not remove previously published street names.
     // Preserve only labels, not obsolete queue assignments.
     if(!manual && hasContent(a)){
       const official=obj(a.streets),previous=obj(b.streets);
       const missing=Object.fromEntries(Object.entries(previous).filter(([key])=>!(key in official)));
       const archivedQueues={};
       for(const key of Object.keys(missing)){
         const candidates=valid(obj(b.streetQueues)[key]);
         if(candidates.length)archivedQueues[key]=candidates;
       }
       return {...a,keys:{...obj(a.keys)},streets:{...missing,...official},
         streetQueues:{...obj(a.streetQueues)},
         archiveOnlyStreets:Object.keys(missing),archivedStreetQueues:archivedQueues};
     }
     if(!manual)return {...b,keys:{...obj(b.keys)},streets:{...obj(b.streets)},streetQueues:{...obj(b.streetQueues)}};
     // Admin corrections are explicit, not a fuzzy merge of conflicting queues.
     const queues={...obj(a.streetQueues)};
     for(const [street,values] of Object.entries(obj(b.streetQueues)))queues[street]=valid(values);
     // Admin-verified edits are no longer flagged as archival.
     const confirmed=new Set([...Object.keys(obj(b.streetQueues)),...Object.keys(obj(b.streets))]);
     const archiveOnly=(Array.isArray(a.archiveOnlyStreets)?a.archiveOnlyStreets:[]).filter(key=>!confirmed.has(key));
     return {...a,...b,keys:{...obj(a.keys),...obj(b.keys)},
       streets:{...obj(a.streets),...obj(b.streets)},streetQueues:queues,
       archiveOnlyStreets:archiveOnly,archivedStreetQueues:{...obj(a.archivedStreetQueues)}};
   }
   const result=combine(live,backup);
   const places={...obj(backup.localities),...obj(live.localities)};
   for(const key of Object.keys(places))places[key]=combine(obj(live.localities)[key],obj(backup.localities)[key]);
   result.localities=places;
   result.updatedAt=live.updatedAt||backup.updatedAt||null;
   result.source=live.source||backup.source||null;
   return result;
 }
 return {mergeIndexes,hasContent};
});
