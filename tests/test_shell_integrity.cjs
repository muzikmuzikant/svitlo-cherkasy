const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('service-worker precache includes only files published by GitHub Pages',()=>{
 const js=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const shell=/const SHELL=\[([^\]]+)\];/.exec(js)?.[1];
 assert.ok(shell,'Expected a Service Worker shell array');
 for(const item of shell.matchAll(/'\.\/([^']*)'/g)){
  const itemPath=item[1];
  if(itemPath) assert.ok(fs.existsSync(path.join(root,itemPath)),`Missing precached file: ${itemPath}`);
 }
});
test('new address lookup module is included in static site publishing and PWA offline cache',()=>{
 const pages=fs.readFileSync(path.join(root,'scripts/build_pages.py'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const install=fs.readFileSync(path.join(root,'install.js'),'utf8');
 assert.match(pages,/address-lookup\.js/);
 assert.match(sw,/address-lookup\.js/);
 assert.match(install,/address-lookup\.js/);
});
