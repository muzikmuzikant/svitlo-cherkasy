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
  function houseKey(value) { return normalize(value); }
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
    const streetOnly=validQueues(idx.streetQueues?.[key]);
    const houses=Object.entries(idx.keys||{}).filter(([address])=>address.startsWith(key+'|'));
    const houseQueues=validQueues(houses.flatMap(([,qs])=>qs||[]));
    const options=validQueues([...streetOnly,...houseQueues]);
    const exact=house ? validQueues(idx.keys?.[`${key}|${houseKey(house)}`]) : [];
    // An exact numbered address outranks unnumbered street hints. Conflicts
    // for the SAME exact house must still be presented rather than guessed.
    if(exact.length===1)return {status:'exact',queue:exact[0],street:display,method:'automatic'};
    if(exact.length>1)return {status:'possible',queues:exact,street:display,reason:'house-conflict'};
    // No house-specific listings contradict the one explicitly street-wide queue:
    // show the queue immediately, without forcing users to type a house.
    if(streetOnly.length===1 && houseQueues.every(q=>q===streetOnly[0]))
      return {status:'street',queue:streetOnly[0],street:display,method:'street-auto'};
    if(options.length>1)return {status:'possible',queues:options,street:display,reason:'multiple'};
    if(houseQueues.length && !streetOnly.length)
      return {status:house?'nohouse':'needhouse',street:display,queues:houseQueues};
    if(streetOnly.length>1)return {status:'possible',queues:options,street:display,reason:'multiple'};
    return {status:'nohouse',street:display,queues:options};
  }
  return {normalize,houseKey,kindOf,streetMatches,suggest,resolve};
});
