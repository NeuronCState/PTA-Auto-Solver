const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const helper=src.slice(src.indexOf('    function toggleCatalogueGroup('),src.indexOf("    var catalogueSignature = ''"));
let reduced=false;const ctx={window:{matchMedia:()=>({matches:reduced})}};vm.createContext(ctx);vm.runInContext(helper,ctx);
function item(){const animations=[];return {section:{open:false,dataset:{expanded:'false'}},summary:{setAttribute(k,v){this[k]=v;}},body:{getBoundingClientRect:()=>({height:80}),scrollHeight:120,animate(frames,options){const a={frames,options,cancel(){this.cancelled=true;}};animations.push(a);return a;}},animations};}
const a=item(),b=item();ctx.toggleCatalogueGroup(a.section,a.body,a.summary);assert.equal(a.section.open,true);assert.equal(a.summary['aria-expanded'],'true');assert.equal(a.animations[0].frames[1].height,'120px');
ctx.toggleCatalogueGroup(b.section,b.body,b.summary);assert.equal(a.section.open,true,'multiple groups may stay open');
a.animations[0].onfinish();assert.equal(a.section.open,true);ctx.toggleCatalogueGroup(a.section,a.body,a.summary);assert.equal(a.section.open,true,'closing animation retains open content until finish');assert.equal(a.section.dataset.expanded,'false');a.animations[1].onfinish();assert.equal(a.section.open,false);
ctx.toggleCatalogueGroup(a.section,a.body,a.summary);const old=a.animations.at(-1);ctx.toggleCatalogueGroup(a.section,a.body,a.summary);old.onfinish();assert.equal(a.section.dataset.expanded,'false','late animation cannot reverse newest target');a.animations.at(-1).onfinish();assert.equal(a.section.open,false);
reduced=true;ctx.toggleCatalogueGroup(a.section,a.body,a.summary);assert.equal(a.section.open,true);assert.equal(a.section.ptaAnimation,null);
delete b.body.animate;ctx.toggleCatalogueGroup(b.section,b.body,b.summary);assert.equal(b.section.open,false);
assert.match(src,/\.pta-catalog-items\{max-height:min\(240px,38vh\);overflow-y:auto;overscroll-behavior:auto/);
const render=src.slice(src.indexOf('    function refreshClassHome()'),src.indexOf('    var classHomeTimer'));
assert.ok(render.indexOf("catalogueState.message || '准备读取…'")>render.indexOf('data.groups.forEach'));
assert.match(render,/scrollPositions\.get/);assert.match(render,/view.scrollTop=outerScroll/);assert.match(render,/list.tabIndex=0/);
console.log('PASS class dropdown animations, independent expansion, rapid reversal, reduced motion/fallback, inner scroll styles and bottom status');
