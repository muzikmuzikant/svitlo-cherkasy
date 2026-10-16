import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('foreground schedule polling interval is 60 seconds',()=>{
 const m=/const AUTO_SCHEDULE_CHECK_MS=(\\d+)_000/.exec(app);
 assert.ok(m,'explicit polling cadence missing');
 assert.ok(Number(m[1])<=60,'foreground polling must be at most 60 seconds');
 assert.match(app,/setInterval\\(\\(\\)=>\\{if\\(!document\\.hidden\\)refreshData\\(\\)\\},AUTO_SCHEDULE_CHECK_MS\\)/);
});
test('foreground resume triggers a fresh read',()=>{
 assert.match(app,/if\\(!document\\.hidden\\)refreshData\\(\\)\\.catch\\(console\\.warn\\)/);
 assert.match(app,/visibilitychange[^\\n]*refreshData\\(\\)/);
 assert.match(app,/if\\(refreshInFlight\\)return refreshInFlight/);
});
test('minute polling throttles auxiliary address and bulletin requests to 5 minutes',()=>{
 assert.match(app,/AUXILIARY_REFRESH_MS=5\\*60_000/);
 assert.match(app,/if\\(refreshAuxiliary\\)\\{[\\s\\S]*?data\\/addresses\\.json[\\s\\S]*?data\\/emergency\\.json[\\s\\S]*?catch\\(error\\)\\{console\\.warn\\('Bulletin or admin overrides:',error\\)\\}\\n\\s*\\}/);
});
