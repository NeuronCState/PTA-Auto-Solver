const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=src.slice(src.indexOf('    var apiDiagnostics ='),src.indexOf('    // Opt-in diagnostics:'));
const key='pta-api-diagnostic-continuation-v1',storage=new Map();let now=1000000;
function newPage(store=storage){
 const callbacks=[];const realm={fetch(){return Promise.resolve();}};
 const ctx={unsafeWindow:realm,window:realm,URL,Blob,Set,WeakMap,TextDecoder,Uint8Array,Promise,Number,JSON,Date:class extends Date{static now(){return now;}},location:{hostname:'pintia.cn',protocol:'https:'},document:{getElementById:()=>null},toast(){},setTimeout(fn,ms){callbacks.push({fn,ms});return callbacks.length;},clearTimeout(){},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
 vm.createContext(ctx);vm.runInContext(section,ctx);return {ctx,callbacks,state:()=>vm.runInContext('apiDiagnostics',ctx)};
}
let p=newPage();p.ctx.resumeApiDiagnostics();assert.equal(p.state().enabled,false);
p.ctx.startApiDiagnostics();assert.equal(p.state().continuation,true);assert.deepEqual(JSON.parse(storage.get(key)),{expiresAt:1300000,remaining:1});assert.equal(storage.size,1);assert.ok(!storage.get(key).includes('records'));
p.state().records.push({test:'memory-only'});p.ctx.stopApiDiagnostics(true);assert.equal(storage.size,1);
now+=10000;p=newPage();p.ctx.resumeApiDiagnostics();assert.equal(p.state().enabled,true);assert.equal(p.state().resumed,true);assert.equal(p.state().records.length,0);assert.equal(p.callbacks.at(-1).ms,290000);assert.equal(storage.size,0);
p.ctx.stopApiDiagnostics(true);p=newPage();p.ctx.resumeApiDiagnostics();assert.equal(p.state().enabled,false,'second reload is not armed');
p.ctx.startApiDiagnostics();p.ctx.stopApiDiagnostics();assert.equal(storage.size,0,'manual stop disarms');
p.ctx.startApiDiagnostics();p.callbacks.at(-1).fn();assert.equal(storage.size,0);assert.equal(p.state().enabled,false,'deadline stops and disarms');
for(const flag of [{expiresAt:now-1,remaining:1},{expiresAt:now+300001,remaining:1},{expiresAt:now+100,remaining:2},'SECRET']){storage.set(key,JSON.stringify(flag));p=newPage();p.ctx.resumeApiDiagnostics();assert.equal(p.state().enabled,false);assert.equal(storage.size,0);}
// Failed page-realm hook during early continuation must not touch absent body.
p=newPage();delete p.ctx.unsafeWindow.fetch;p.ctx.toast=()=>{throw Error('No body yet');};
assert.doesNotThrow(()=>p.ctx.startApiDiagnostics());
assert.equal(p.state().enabled,false);assert.equal(p.state().error,'当前浏览器无法记录接口诊断');
// A closed tab has no sessionStorage; a fresh session cannot resume.
p=newPage(new Map());p.ctx.resumeApiDiagnostics();assert.equal(p.state().enabled,false);
assert.match(src,/@run-at\s+document-start/);assert.ok(src.indexOf('    resumeApiDiagnostics();')<src.indexOf("    if (document.readyState === 'loading')"));assert.match(src,/pagehide',function\(\)\{stopApiDiagnostics\(true\);apiDiagnostics.records=\[\];apiDiagnostics.bytes=0;/);
// Execute the entire userscript with no document body at document-start.
const events=[];const earlyWindow={addEventListener:n=>events.push(n)};earlyWindow.top=earlyWindow;earlyWindow.self=earlyWindow;
vm.runInNewContext(src,{window:earlyWindow,location:{hostname:'pintia.cn',protocol:'https:',href:'https://pintia.cn/problem-sets/dashboard'},document:{readyState:'loading',addEventListener:n=>events.push(n)},URL,Set,Map,WeakMap,AbortController});
assert.deepEqual(events,['pagehide','DOMContentLoaded']);
console.log('PASS: one-use tab flag only; continuation consumes remaining TTL, no records persisted; manual stop, timeout, malformed/expired flag and fresh session cannot resume');
