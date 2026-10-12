/** Shared, original Ukrainian notices and canonical IDs.
 * Browser clients load notification-text.js as a classic script. Railway loads it
 * for its globalThis export, so the module can be shared without bundling.
 */
import '../notification-text.js';
const copy=globalThis.SvitloNotificationText;
if(!copy)throw Error('Shared notification copy did not initialize');
export const {transitionCopy,tomorrowCopy,changeCopy,emergencyCopy,testCopy,firstPublishedAt,dayId,changeId,isLatestRevision,emergencyId}=copy;
