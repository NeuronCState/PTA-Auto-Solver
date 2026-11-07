const fs=require('node:fs'),assert=require('node:assert/strict');const s=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
for(const cls of ['pta-catalog-items','pta-catalog-archive-list']){
 const rule=s.match(new RegExp('#pta-class-home \\.'+cls+'\\{([^}]+)\\}'));assert.ok(rule);assert.match(rule[1],/overflow-y:auto/);assert.match(rule[1],/overscroll-behavior:auto/);assert.ok(!/overscroll-behavior(?:-y)?:(?:none|contain)/.test(rule[1]));
}
assert.match(s,/#pta-class-home\{[^}]*overflow:auto/);assert.ok(!/addEventListener\(['"](?:wheel|mousewheel|touchmove)['"]/.test(s));assert.ok(!/touch-action:\s*none/.test(s));
console.log('PASS native nested catalogue scroll chaining, bounded inner lists, scrollable outer list and no wheel/touch interception');
