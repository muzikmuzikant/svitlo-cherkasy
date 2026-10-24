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
 function mergeIndexes(current, historical, {manual=false,catalog=null,aliasCatalog=null}={}){
   const live=obj(current), backup=obj(historical);
   function combine(a,b){
     a=obj(a);b=obj(b);
     // A partial official update must not remove previously published street names.
     // Preserve only labels, not obsolete queue assignments.
     if(!manual && hasContent(a)){
       const official=obj(a.streets),previous=obj(b.streets);
       const missing=Object.fromEntries(Object.entries(previous).filter(([key])=>!(key in official)));
       const confirmedQueues=obj(a.streetQueues);
       // The latest importer itself may contain names carried over from older
       // official PDFs. They are NOT freshly confirmed queue assignments.
       const archived=new Set(Array.isArray(a.archiveOnlyStreets)?a.archiveOnlyStreets:[]);
       const archivedQueues={...obj(a.archivedStreetQueues)};
       for(const key of Object.keys(missing)){
         archived.add(key);
         const candidates=valid(obj(b.archivedStreetQueues)[key]).concat(valid(obj(b.streetQueues)[key]));
         if(candidates.length)archivedQueues[key]=[...new Set(candidates)].sort((x,y)=>Number(x)-Number(y));
       }
       for(const key of [...archived]){
         if(!(key in official)&&!(key in missing)||key in confirmedQueues)archived.delete(key);
       }
       for(const key of Object.keys(archivedQueues))if(!archived.has(key))delete archivedQueues[key];
       return {...a,keys:{...obj(a.keys)},streets:{...missing,...official},
         streetQueues:{...confirmedQueues},
         archiveOnlyStreets:[...archived].sort(),archivedStreetQueues:archivedQueues,
         reportedStreetNames:[...new Set([...(Array.isArray(a.reportedStreetNames)?a.reportedStreetNames:[]),...(Array.isArray(b.reportedStreetNames)?b.reportedStreetNames:[])])].filter(key=>archived.has(key))};
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
   // A separate geographic catalogue expands discoverability only. It must
   // NEVER supply a queue, house number, or verification status.
   if(!manual && catalog && typeof catalog==='object' && !Array.isArray(catalog)){
     function supplement(target,geo){
       if(!geo||typeof geo!=='object')return target;
       const existing=obj(target.streets),streetNames=obj(geo.streets);
       const archive=new Set(Array.isArray(target.archiveOnlyStreets)?target.archiveOnlyStreets:[]);
       const external=new Set(Array.isArray(target.externalStreetNames)?target.externalStreetNames:[]);
       const addition={};
       for(const [key,label] of Object.entries(streetNames)){
         if(!/^(вулиця|провулок|проспект|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\|[\p{L}\p{N}]{2,90}$/u.test(key)
           ||typeof label!=='string'||label.length>105)continue;
         if(!(key in existing)){
           addition[key]=label;
           archive.add(key);external.add(key);
         }
       }
       for(const key of external){
         if(!archive.has(key)||key in obj(target.streetQueues))external.delete(key);
       }
       return {...target,streets:{...existing,...addition},
         archiveOnlyStreets:[...archive].sort(),
         externalStreetNames:[...external].sort()};
     }
     Object.assign(result,supplement(result,catalog));
     const geoPlaces=obj(catalog.localities);
     for(const town of Object.keys(result.localities)){
       if(geoPlaces[town])result.localities[town]=supplement(result.localities[town],geoPlaces[town]);
     }
   }
   // Curated municipal rename aliases are search metadata ONLY. No alias is
   // converted into a house record, queue, or unverified street assignment.
   if(!manual && aliasCatalog && typeof aliasCatalog==='object'){
     const aliases=obj(aliasCatalog.localities);
     for(const [locality,sourcePairs] of Object.entries(aliases)){
       const target=locality==='черкаси'?result:result.localities[locality];
       if(!target||!Array.isArray(sourcePairs))continue;
       const pairs=sourcePairs.filter(pair=>
         pair && typeof pair==='object' && typeof pair.oldName==='string' &&
         typeof pair.newName==='string' && pair.oldName.length<110 && pair.newName.length<110 &&
         pair.oldName!==pair.newName && typeof pair.source==='string' &&
         /^https:\/\/(?:chmr\.golos\.net\.ua|chmr\.gov\.ua)\//.test(pair.source));
       target.aliases=pairs.map(({oldName,newName,source})=>({oldName,newName,source}));
       // These are NOT municipal renames. They are exact, reviewed FULL name
       // variants of abbreviated names in the operator's actual PDF lists.
       const variants=obj(aliasCatalog.spellingVariants)[locality];
       if(Array.isArray(variants)){
         target.spellingVariants=variants.filter(v=>
           v && typeof v.sourceKey==='string' && typeof v.displayKey==='string' &&
           typeof v.sourceName==='string' && typeof v.displayName==='string' &&
           v.sourceKey!==v.displayKey && v.sourceName!==v.displayName &&
           v.sourceKey in obj(target.streets) &&
           obj(target.streets)[v.sourceKey]===v.sourceName &&
           /^https:\/\/www\.cherkasyoblenergo\.com\/static\/perelik-gpv$/.test(v.source||''))
           .map(({sourceKey,displayKey,sourceName,displayName,source})=>
             ({sourceKey,displayKey,sourceName,displayName,source}));
       }
       const split=obj(aliasCatalog.splitRenames)[locality];
       if(Array.isArray(split)){
         target.splitRenames=split.filter(p=>
           p && typeof p.oldName==='string' && Array.isArray(p.newNames) &&
           p.newNames.length>=2 && p.newNames.every(n=>typeof n==='string') &&
           typeof p.source==='string' &&
           /^https:\/\/chmr\.golos\.net\.ua\//.test(p.source))
           .map(({oldName,newNames,source})=>({oldName,newNames,source}));
       }
     }
   }
   result.updatedAt=live.updatedAt||backup.updatedAt||null;
   result.source=live.source||backup.source||null;
   return result;
 }
 return {mergeIndexes,hasContent};
});
