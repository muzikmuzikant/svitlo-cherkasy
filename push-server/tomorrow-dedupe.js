/* Daily plan push is an announcement, not a change bulletin.
 * Keep its identity stable across mirrored snapshots and revisions.
 * Old revision-qualified keys remain accepted for zero-repeat upgrades.
 */
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
export function tomorrowKey(endpointHash,date){
 if(typeof endpointHash!=='string'||!endpointHash||!DAY.test(date))throw Error('Invalid tomorrow identity');
 return endpointHash+':tomorrow:'+date;
}
export function alreadySentTomorrow(sent,endpointHash,date){
 const key=tomorrowKey(endpointHash,date);
 return Object.hasOwn(sent,key)||Object.keys(sent).some(old=>old.startsWith(key+':'));
}
