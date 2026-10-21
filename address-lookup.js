/* Address matching is deliberately conservative: a house-specific listing is not
 * proof that every building on the street belongs to the same queue. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SvitloAddressLookup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function normalize(s) {
    return String(s || '').toLocaleLowerCase('uk-UA')
      .replace(/[’ʼ`]/g, "'")
      .replace(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз)\s+/i,'')
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
    const match=/^(пров(?:улок|\.)?|вул(?:иця)?\.?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз)\s+/i.exec(String(street||''));
    if (!match) return null;
    const k=match[1].toLocaleLowerCase('uk-UA');
    if(k.startsWith('пров'))return 'провулок';
    if(k.startsWith('просп')||k.startsWith('пр-т'))return 'проспект';
    if(k.startsWith('буль')||k.startsWith('б-р'))return 'бульвар';
    if(k.startsWith('узв'))return 'узвіз';
    return 'вулиця';
  }
  function queueSort(a,b) { return Number(a)-Number(b); }
  function validQueues(values) {
    return [...new Set((Array.isArray(values)?values:[]).filter(q => /^[1-6]\.[12]$/.test(q)))].sort(queueSort);
  }
  function streetMatches(idx, typed, selectedKey) {
    const kind=kindOf(typed);
    const needle=normalize(typed);
    if (!needle) return [];
    const all=Object.entries(idx?.streets||{}).filter(([key,name]) =>
      (normalize(key.split('|')[1])===needle || normalize(name)===needle) && (!kind || key.startsWith(kind+'|')));
    if (selectedKey && all.some(([key]) => key === selectedKey)) return all.filter(([key]) => key===selectedKey);
    return all;
  }
  function suggest(idx, typed, limit=12) {
    const raw=normalize(typed);
    const type=kindOf(typed);
    if(raw.length<2)return [];
    return Object.entries(idx?.streets||{})
      .filter(([key,name])=> (!type||key.startsWith(type+'|')) && (normalize(name).includes(raw)||normalize(key.split('|')[1]).includes(raw)))
      .sort(([ka,na],[kb,nb])=>{
        const sa=normalize(na),sb=normalize(nb),pa=sa.startsWith(raw)?0:1,pb=sb.startsWith(raw)?0:1;
        return pa-pb||sa.localeCompare(sb,'uk-UA')||ka.localeCompare(kb,'uk-UA');
      }).slice(0,limit);
  }
  function resolve({idx,street,house,settlement,selectedKey}={}) {
    street=String(street||'').trim();house=String(house||'').trim();
    if(!String(settlement||'').trim()||!street)return {status:'incomplete'};
    if(!Object.keys(idx?.streets||{}).length)return {status:'unavailable'};
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
    if(streetOnly.length===1 && houseQueues.every(q=>q===streetOnly[0]) && (!house || !houses.length))
      return {...base,status:'street',queue:streetOnly[0],method:'street-auto'};
    if(options.length>1){
      return {...base,status:'possible',reason:houses.length?(house?'house-unlisted':'needs-house'):'no-house-index'};
    }
    if(houses.length&&!streetOnly.length)
      return {...base,status:house?'nohouse':'needhouse'};
    return {...base,status:'nohouse',reason:house?'house-unlisted':'no-address-data'};
  }

  return {normalize,houseKey,kindOf,streetMatches,suggest,knownHouses,resolve};
});
