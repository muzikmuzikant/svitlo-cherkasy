import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('foreground schedule polling takes no longer than 60 seconds',()=>{
 const m=/const AUTO_SCHEDULE_CHECK_MS=(\d+)_000/.exec(app);
 assert.ok(m,'explicit polling cadence missing');
 assert.ok(Number(m[1])<=60,'foreground polling should be at most 60 seconds');
 assert.match(app,/setInterval\(\(\)=>\{if\(!document\.hidden\)refreshData\(\)\},AUTO_SCHEDULE_CHECK_MS\)/);
});
test('background PWA does not poll and returning to foreground refreshes schedule',()=>{
 assert.match(app,/if\(!document\.hidden\)refreshData\(\)\.catch\(console\.warn\)/);
 assert.match(app,/visibilitychange[^\n]*refreshData\(\)/);
 assert.match(app,/if\(refreshInFlight\)return refreshInFlight/);
});
test('high-frequency refresh does not re-download large maps and bulletins on every tick',()=>{
 assert.match(app,/AUXILIARY_REFRESH_MS=5\*60_000/);
 assert.match(app,/if\(refreshAuxiliary\)\{[\s\S]*?data\/addresses\.json[\s\S]*?data\/emergency\.json[\s\S]*?catch\(error\)\{console\.warn\('Bulletin or admin overrides:',error\)\}\n\s*\}/);
 assert.match(app,/const refreshAuxiliary=manual\|\|!lastAuxiliaryRefresh/);
});
