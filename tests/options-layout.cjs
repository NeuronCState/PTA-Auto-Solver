const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const row=src.match(/<div class="pta-options">([\s\S]*?)<\/div>/)[1];
assert.deepEqual([...row.matchAll(/id="([^"]+)"/g)].map(m=>m[1]),['pta-skip','pta-continuous','pta-assistance-mode']);
assert.equal((row.match(/type="checkbox"/g)||[]).length,3);
const rules=[...src.matchAll(/\.pta-options\{([^}]+)\}/g)];assert.equal(rules.length,1);
assert.match(rules[0][1],/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(src,/#pta-root \.pta-options > \.pta-check\{min-width:0;min-height:36px;padding:6px;gap:0;white-space:normal;line-height:1.35;text-align:center;overflow-wrap:anywhere\}/);
assert.match(src,/\.pta-check:has\(input:focus-visible\)/);
assert.match(src,/width:min\(390px,calc\(100vw - 24px\)\)/);
// Geometric budget only, not a browser layout test. The 5-character label
// fits at default 11px down to 280px; smaller/zoomed text may wrap within its
// own cell, never moves the third control to another grid row.
for(const viewport of [280,320,375,600,1280]){
 const shell=Math.min(390,viewport-24),cell=(shell-28-16)/3;
 assert.ok(cell>=55+12+2, 'five CJK characters plus padding/border fit '+viewport);
}
console.log('PASS static options layout: three ordered checkbox columns, narrow-width budget, wrapping within cells and keyboard focus styles (not browser rendering)');
