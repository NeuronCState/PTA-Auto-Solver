const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');const render=src.slice(src.indexOf('    function render()'),src.indexOf('    function closeModelDropdown()'));
assert.match(render,/<div id="pta-shell">/);assert.ok(!render.includes('id="pta-shell" class="collapsed"'));assert.match(render,/<div id="pta-drawer" class="pta-drawer">/);assert.match(render,/if \(document.getElementById\('pta-root'\)\) return/);
const boot=src.slice(src.indexOf('    function boot()'),src.indexOf('    // Resume at document-start'));
assert.ok(!/startSolve|startAssistance|autoSolve/.test(boot));assert.ok(!src.includes('面板已就绪，进入具体题目后开始。'));
assert.match(src,/getElementById\('pta-collapse'\)[^\n]*shell.classList.add\('collapsed'\)[^\n]*drawer.classList.remove\('open'\)/);
assert.match(src,/#pta-shell:not\(\.collapsed\)\{display:flex;flex-direction:column\}/);assert.match(src,/#pta-root \.pta-expanded\{flex:1 1 auto;min-height:0;min-width:0;width:100%;max-width:100%;padding:14px;overflow-y:auto;overflow-x:hidden\}/);
// Existing-root render is a no-op: SPA refreshes cannot reopen a manually collapsed panel.
let calls=0;const ctx={document:{getElementById:()=>({}),createElement:()=>{calls++;throw Error('must not recreate existing root')}}};vm.createContext(ctx);vm.runInContext(render,ctx);ctx.render();assert.equal(calls,0);
assert.match(src,/function log\(message, level\)/);assert.match(src,/log\('模型读取失败：' \+ error.message, 'warning'\)/);
console.log('PASS expanded main startup, closed settings, no auto solve, preserved manual/SPA state, removed boot-only message and symmetric scrollable content insets');
