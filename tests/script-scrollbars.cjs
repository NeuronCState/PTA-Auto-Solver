const fs=require('node:fs'),assert=require('node:assert/strict');const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');const css=src.slice(src.indexOf('    /* Script-owned scrollbars only:'),src.indexOf('    /* Both header rules share'));
for(const token of ['#pta-root','#pta-class-home','.pta-assist-popover','#pta-api-diagnostic-preview','scrollbar-color:var(--pta-scroll-thumb) transparent','::-webkit-scrollbar-track','::-webkit-scrollbar-track-piece','::-webkit-scrollbar-corner','::-webkit-scrollbar-thumb:hover','::-webkit-scrollbar-thumb:active','html.pta-theme-dark','@media(forced-colors:active)','scrollbar-color:auto','background:ButtonText','width:12px;height:12px','min-height:28px'])assert.ok(css.includes(token),token);
// Every style selector is rooted in a script-owned container, never document/body/global *.
for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 const selector=match[1].trim();if(selector.startsWith('@'))continue;assert.match(selector,/:is\(#pta-root,#pta-class-home,/,selector);assert.ok(!selector.includes('body'));
}
assert.ok(!/scrollbar-width\s*:\s*none|display\s*:\s*none|opacity\s*:\s*0/.test(css));
assert.match(src,/#pta-root\{--pta-header-rule-y:62px\}/);assert.match(src,/#pta-root \.pta-top\{height:var\(--pta-header-rule-y\)/);assert.match(src,/#pta-root \.pta-drawer-head::after\{[^}]*top:calc\(var\(--pta-header-rule-y\) - 1px\)/);assert.match(src,/#pta-root \.pta-drawer-head\{height:auto;min-height:74px;flex:0 0 auto;padding:12px 14px 0/);
console.log('PASS transparent scoped scrollbar tracks, visible themed thumbs, standard/WebKit fallback, forced colors, shared header separator and retained text offset');
