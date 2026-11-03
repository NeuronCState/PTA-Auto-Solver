const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=source.slice(source.indexOf('    var diagnostics ='),source.indexOf('    function boot()'));
let timers=0,disconnects=0; const callbacks=new Map();
const context={URL,Blob,Date,location:{href:'https://pintia.cn/problem?token=private#secret',hostname:'pintia.cn',protocol:'https:'},document:{getElementById:()=>null,body:{}},setTimeout:(fn)=>{callbacks.set(++timers,fn);return timers;},clearTimeout(id){callbacks.delete(id);},setInterval:()=>++timers,clearInterval(){},MutationObserver:class {observe(){}disconnect(){disconnects++;}},toast(){}};
vm.createContext(context);vm.runInContext(code,context);
assert.equal(vm.runInContext('diagnostics.enabled',context),false);
assert.equal(context.diagnosticURL(context.location.href),'https://pintia.cn/problem');
assert.equal(context.diagnosticURL('https://pintia.cn.evil.test/x?token=secret'),'[external URL removed]');
assert.equal(context.diagnosticURL('https://name:pass@pintia.cn/x?q=secret'),'https://pintia.cn/x');
assert(!context.diagnosticRedact('Bearer abc123 password=hello sk-abcdefghijk https://pintia.cn/x?token=private').includes('private'));
assert(!context.diagnosticRedact('password=hello').includes('hello'));
vm.runInContext('diagnosticHTML = function () { return "<html>safe</html>"; };',context);
context.startDiagnostics();assert.equal(vm.runInContext('diagnostics.records.length',context),1);
let before=timers;context.scheduleDiagnostic('one');context.scheduleDiagnostic('two');assert.equal(timers-before,1);
// Simulate asynchronous judge text changing while a throttled snapshot is pending.
vm.runInContext('diagnosticHTML = function () { return "等待评测"; };',context);
context.captureDiagnostic('pending');
vm.runInContext('diagnosticHTML = function () { return "分数 12 / 20 检查点3运行超时"; };',context);
callbacks.get(vm.runInContext('diagnostics.timer',context))();
assert.match(vm.runInContext('diagnostics.records.at(-1).html',context),/12 \/ 20/);
for(let i=0;i<30;i++) {
 vm.runInContext('diagnosticHTML = function () { return "progress '+i+'"; };',context);
 context.captureDiagnostic('test');
}
assert.equal(vm.runInContext('diagnostics.records.length',context),20);
assert.equal(vm.runInContext('diagnostics.enabled',context),true);
vm.runInContext('diagnosticHTML = function () { return "final grade after 30 changes"; };',context);
context.captureDiagnostic('final');
assert.equal(vm.runInContext('diagnostics.records.at(-1).html',context),'final grade after 30 changes');
context.captureDiagnostic('duplicate');assert.equal(vm.runInContext('diagnostics.records.length',context),20);
// Large snapshots rotate by byte budget as well as count.
for(let i=0;i<30;i++) {
 vm.runInContext('diagnosticHTML = function () { return "'+i+'" + "中".repeat(399000); };',context);
 context.captureDiagnostic('budget');
}
assert(vm.runInContext('diagnostics.bytes <= 4*1024*1024',context));
assert(vm.runInContext('diagnostics.records.length < 20',context));
assert.equal(vm.runInContext('diagnostics.enabled',context),true);
// The five-minute cutoff takes one last snapshot, then disconnects and clears timers.
vm.runInContext('diagnosticHTML = function () { return "final at cutoff"; };',context);
callbacks.get(vm.runInContext('diagnostics.endTimer',context))();
assert.equal(vm.runInContext('diagnostics.records.at(-1).html',context),'final at cutoff');
assert.equal(vm.runInContext('diagnostics.enabled',context),false);
assert(disconnects>0);
context.location.hostname='example.com';context.startDiagnostics();assert.equal(vm.runInContext('diagnostics.enabled',context),false);
assert(!/GM_xmlhttpRequest|fetch\(|localStorage|sessionStorage/.test(code));
console.log('PASS: diagnostics defaults, URL/token redaction, domain, throttle, record/byte limits, stop cleanup, no network/storage calls');
