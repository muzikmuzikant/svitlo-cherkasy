/* Address matching is deliberately conservative: a house-specific listing is not
 * proof that every building on the street belongs to the same queue. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SvitloAddressLookup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function withPrefixSpaces(s){
    // Operator PDFs also contain "вул.Зінченко" and "Вулиця вул. Зінченко".
    // Normalize punctuation safely without matching different actual streets.
    return String(s||'').replace(/^\s*(вул\.|пров\.|просп\.|пр-т\.|б-р\.)\s*/i,'$1 ');
  }
  function normalize(s) {
    return withPrefixSpaces(s).toLocaleLowerCase('uk-UA')
      .replace(/[’ʼ`]/g, "'")
      .replace(/^(?:(?:вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\s+){1,3}/i,'')
      .replace(/[^\p{L}\p{N}/]+/gu,'');
  }
  // Official PDFs normally use Cyrillic suffixes (12-А), while phone keyboards
  // frequently insert Latin lookalikes (12-A). Do not conflate real distinct
  // letters or different fractions of the same building.
  function houseKey(value) {
    const lookalikes={a:'а',c:'с',e:'е',h:'н',i:'і',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
    return normalize(String(value||'').replace(/^\s*(?:буд(?:инок|\.)?|№|#)\s*/i,''))
      .replace(/[acehikmoptxy]/g,c=>lookalikes[c]||c);
  }
  function knownHouses(idx,streetKey){
    const prefix=streetKey+'|';
    return Object.entries(idx?.keys||{})
      .filter(([key,queues])=>key.startsWith(prefix)&&key.length>prefix.length&&validQueues(queues).length)
      .map(([key,queues])=>({number:key.slice(prefix.length),queues:validQueues(queues)}))
      .sort((a,b)=>a.number.localeCompare(b.number,'uk-UA',{numeric:true,sensitivity:'base'}));
  }
  function kindOf(street) {
    const match=/^(пров(?:улок|\.)?|вул(?:иця)?\.?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\s+/i.exec(withPrefixSpaces(street));
    if (!match) return null;
    const k=match[1].toLocaleLowerCase('uk-UA');
    if(k.startsWith('пров'))return 'провулок';
    if(k.startsWith('просп')||k.startsWith('пр-т'))return 'проспект';
    if(k.startsWith('буль')||k.startsWith('б-р'))return 'бульвар';
    if(k.startsWith('узв'))return 'узвіз';
    if(['алея','площа','майдан','шосе','набережна','тупик','проїзд'].includes(k))return k;
    return 'вулиця';
  }
  function queueSort(a,b) { return Number(a)-Number(b); }
  function validQueues(values) {
    return [...new Set((Array.isArray(values)?values:[]).filter(q => /^[1-6]\.[12]$/.test(q)))].sort(queueSort);
  }
  function directMatches(idx, typed) {
    const kind=kindOf(typed),needle=normalize(typed);
    if(!needle)return [];
    return Object.entries(idx?.streets||{}).filter(([key,name]) =>
      (normalize(key.split('|')[1])===needle || normalize(name)===needle) &&
      (!kind || key.startsWith(kind+'|')));
  }
  function renamePairs(idx){
    return Array.isArray(idx?.aliases)?idx.aliases.filter(pair=>
      pair && typeof pair.oldName==='string' && typeof pair.newName==='string'):[];
  }
  function renamedCandidates(idx,typed,exactOnly=true){
    const needle=normalize(typed),kind=kindOf(typed);
    if(!needle)return [];
    const out=new Map();
    for(const pair of renamePairs(idx)){
      // Aliases can cross street types: провулок -> вулиця or узвіз.
      for(const [aliasName,otherName] of [[pair.oldName,pair.newName],[pair.newName,pair.oldName]]){
        const key=normalize(aliasName);
        if((exactOnly?key===needle:key.includes(needle)) && (!kind || kind===kindOf(aliasName))){
          // Only names that actually exist in the index are eligible.
          for(const [streetKey,label] of directMatches(idx,otherName))out.set(streetKey,label);
        }
      }
    }
    return [...out.entries()];
  }
  function streetMatches(idx, typed, selectedKey) {
    const direct=directMatches(idx,typed);
    // Exact current/archived source record always wins against an alias.
    // Never join both names' house indexes or invent a queue.
    const matches=direct.length?direct:renamedCandidates(idx,typed,true);
    if (selectedKey && matches.some(([key])=>key===selectedKey))
      return matches.filter(([key])=>key===selectedKey);
    return matches;
  }
  function suggest(idx, typed, limit=12) {
    const raw=normalize(typed),type=kindOf(typed);
    if(raw.length<2)return [];
    const chosen=new Map();
    for(const [key,name] of Object.entries(idx?.streets||{})){
      if ((!type||key.startsWith(type+'|')) &&
          (normalize(name).includes(raw)||normalize(key.split('|')[1]).includes(raw)))
        chosen.set(key,name);
    }
    // Renamed-street suggestions only point to an existing street entry,
    // and do not import obsolete queue assignments.
    // One old street can have two different new names; suggest BOTH, never
    // collapse their house/queue records into one key.
    const split=splitHint(idx,typed);
    if(split){
      for(const modern of split.newNames){
        for(const [key,name] of directMatches(idx,modern))if(!chosen.has(key))chosen.set(key,name);
      }
    }
    for(const [key,name] of renamedCandidates(idx,typed,false)){
      if(!chosen.has(key))chosen.set(key,name);
    }
    function rank([key,name]){
      const n=normalize(name),k=normalize(key.split('|')[1]);
      if(n===raw||k===raw)return 0;
      if(n.startsWith(raw)||k.startsWith(raw))return 1;
      if(n.includes(raw)||k.includes(raw))return 2;
      return 3; // matched a verified former/current name
    }
    return [...chosen.entries()].sort((a,b)=>rank(a)-rank(b)||
      a[1].localeCompare(b[1],'uk-UA')||a[0].localeCompare(b[0],'uk-UA')).slice(0,limit);
  }
  function renameHint(idx,typed){
    const needle=normalize(typed),kind=kindOf(typed);
    for(const pair of renamePairs(idx)){
      if((normalize(pair.oldName)===needle && (!kind||kind===kindOf(pair.oldName))) ||
         (normalize(pair.newName)===needle && (!kind||kind===kindOf(pair.newName))))
        return {oldName:pair.oldName,newName:pair.newName,source:pair.source||''};
    }
    return null;
  }
  function splitHint(idx,typed){
    const needle=normalize(typed),kind=kindOf(typed);
    if(!needle)return null;
    return (Array.isArray(idx?.splitRenames)?idx.splitRenames:[]).find(p=>
      p && typeof p.oldName==='string' && Array.isArray(p.newNames) &&
      normalize(p.oldName)===needle && (!kind || kind===kindOf(p.oldName)))||null;
  }
  function resolve({idx,street,house,settlement,selectedKey}={}) {
    street=String(street||'').trim();house=String(house||'').trim();
    if(!String(settlement||'').trim()||!street)return {status:'incomplete'};
    if(!Object.keys(idx?.streets||{}).length)return {status:'unavailable'};
    const split=splitHint(idx,street);
    if(split)return {status:'possible',reason:'split-rename',street,
      queues:[],knownHouses:[],hasHouseData:false,
      splitNewNames:split.newNames.slice(0,6)};
    const matches=streetMatches(idx,street,selectedKey);
    if(matches.length===0)return {status:'nostreet'};
    if(matches.length>1)return {status:'ambiguous'};
    const [key,display]=matches[0];
    // Archived entries are searchable but cannot automatically confirm a queue.
    if(Array.isArray(idx.archiveOnlyStreets)&&idx.archiveOnlyStreets.includes(key))
      return {status:'possible',reason:Array.isArray(idx.reportedStreetNames)&&idx.reportedStreetNames.includes(key)?'reported-only':Array.isArray(idx.externalStreetNames)&&idx.externalStreetNames.includes(key)?'external-only':'archived-only',street:display,streetKey:key,
        queues:validQueues(idx.archivedStreetQueues?.[key]),knownHouses:[],hasHouseData:false};
    const streetOnly=validQueues(idx.streetQueues?.[key]);
    const houses=knownHouses(idx,key);
    const houseQueues=validQueues(houses.flatMap(x=>x.queues));
    const options=validQueues([...streetOnly,...houseQueues]);
    const exact=house ? validQueues(houses.filter(x=>houseKey(x.number)===houseKey(house)).flatMap(x=>x.queues)) : [];
    const base={street:display,streetKey:key,queues:options,knownHouses:houses,hasHouseData:houses.length>0};
    // Only an explicit house hit, not a coincidental street match, can confirm
    // the queue on a street with multiple possible queues.
    if(exact.length===1)return {...base,status:'exact',queue:exact[0],method:'automatic'};
    if(exact.length>1)return {...base,status:'possible',queues:exact,reason:'house-conflict'};
    // Preserve existing single-street automatic resolution where no other
    // known house contradicts the street-wide record.
    if(streetOnly.length===1 && houseQueues.every(q=>q===streetOnly[0]))
      return {...base,status:'street',queue:streetOnly[0],method:'street-auto'};
    if(options.length>1){
      return {...base,status:'possible',reason:houses.length?(house?'house-unlisted':'needs-house'):'no-house-index'};
    }
    if(houses.length&&!streetOnly.length)
      return {...base,status:house?'nohouse':'needhouse'};
    return {...base,status:'nohouse',reason:house?'house-unlisted':'no-address-data'};
  }

  return {normalize,houseKey,kindOf,streetMatches,suggest,renameHint,splitHint,knownHouses,resolve};
});
