const fs=require('node:fs'),assert=require('node:assert/strict');const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const markup=src.slice(src.indexOf('<details class="pta-field pta-dev-options">'),src.indexOf('<div class="pta-help">配置均'));
assert.equal((markup.match(/class="pta-dev-card"/g)||[]).length,2);assert.equal((markup.match(/class="pta-dev-actions"/g)||[]).length,2);
for(const id of ['pta-diagnostic-toggle','pta-api-diagnostic-toggle','pta-diagnostic-export','pta-diagnostic-clear','pta-api-diagnostic-preview-btn','pta-api-diagnostic-clear'])assert.equal((markup.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
for(const match of markup.matchAll(/<button[^>]+>/g)){assert.match(match[0],/type="button"/);assert.match(match[0],/class="pta-dev-btn/);assert.match(match[0],/aria-label=/);}
assert.match(markup,/aria-describedby="pta-diagnostic-status"/);assert.match(markup,/aria-describedby="pta-api-diagnostic-status"/);
const css=src.slice(src.indexOf('    /* Developer controls:'),src.indexOf('    .pta-platform-link{'));
for(const token of ['min-height:44px','minmax(0,1.4fr) minmax(0,1fr)',':focus-visible',':disabled',':not(:disabled):hover','@media(max-width:380px)','prefers-reduced-motion','input[type=checkbox]','width:16px;height:16px','html.pta-theme-dark #pta-root .pta-dev-btn-primary:not(:disabled):hover{color:#111}'])assert.ok(css.includes(token),token);
assert.ok(!/(?:^|[;{])width:\s*\d{3}px/.test(css));
const preview=src.slice(src.indexOf('    function previewApiDiagnostics()'),src.indexOf('    // Opt-in diagnostics:'));
assert.match(preview,/panel.className='pta-dev-preview'/);assert.match(preview,/download.className='pta-dev-btn pta-dev-btn-primary'/);assert.match(preview,/close.className='pta-dev-btn'/);
assert.match(src,/getElementById\('pta-diagnostic-export'\).addEventListener\('click', exportDiagnostics\)/);assert.match(src,/getElementById\('pta-api-diagnostic-preview-btn'\).addEventListener\('click',previewApiDiagnostics\)/);
console.log('PASS developer controls retain IDs/actions with scoped responsive layout, native toggles, accessible labels, focus/hover/disabled/dark and reduced-motion styles');
