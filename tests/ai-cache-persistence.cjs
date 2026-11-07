const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    // Private, bounded local userscript cache.'),src.indexOf('    function solveOne('));
const store=new Map();let user='100',failure=false,fetches=0,now=1000;
function fresh(){const ctx={Map,Promise,TextDecoder,AbortController,setTimeout,clearTimeout,Date:{now:()=>now},log(){},state:{runId:1,provider:'mimo',language:'java',configs:{mimo:{model:'m',apiKey:'SECRET'}}},assistance:{run:1},location:{origin:'https://pintia.cn',pathname:'/problem-sets/123/exam/problems/type/2',hash:''},endpoint:()=> 'https://api.xiaomimimo.com/v1/chat/completions',GM_getValue:(k,f)=>store.get(k)||f,GM_setValue:(k,v)=>store.set(k,v),GM_deleteValue:k=>store.delete(k),fetch:async(url,opts)=>{fetches++;assert.equal(url,'/api/problem-sets/123/exams');assert.equal(opts.credentials,'same-origin');assert.equal(opts.mode,'same-origin');assert.equal(opts.headers.Accept,'application/json;charset=UTF-8');if(failure)throw Error('no login');return {ok:true,headers:{get:n=>n==='content-type'?'application/json':null},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({exam:{id:'456',userId:user,problemSetId:'123'}})));c.close();}})}}};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;}
const key=c=>c.aiCacheKey('answer','choice',{description:'q',options:[{label:'A',text:'T'}]},{id:'q'},0);
const generation=c=>vm.runInContext('aiCacheGeneration',c);
const flush=c=>vm.runInContext('aiCacheStorageQueue',c);
(async()=>{
 // Byte-bounded streamed reads, including no Content-Length, cancel and unsupported streams.
 const streamCtx=fresh();let cancelled=0;
 await assert.rejects(streamCtx.aiCacheResponseText({headers:{get:()=>String(1024*1024+1)},body:null}),/large/);
 await assert.rejects(streamCtx.aiCacheResponseText({headers:{get:()=>null},text(){throw Error('must not use text');}}),/stream unavailable/);
 const huge={headers:{get:()=>null},body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(600000));},cancel(){cancelled++;}})};
 await assert.rejects(streamCtx.aiCacheResponseText(huge),/large/);assert.equal(cancelled,1);
 const controller=new AbortController();const stalled={headers:{get:()=>null},body:new ReadableStream({cancel(){cancelled++;}})};
 const pending=streamCtx.aiCacheResponseText(stalled,controller.signal);controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(cancelled,2);
 let a=fresh();await Promise.all([a.prepareAIAnswerCache(),a.prepareAIAnswerCache()]);assert.equal(fetches,1);const k=key(a);a.aiCacheWrite(k,'A',generation(a));await flush(a);
 assert.equal(store.size,1);assert.ok(!Array.from(store.values())[0].includes('SECRET'));
 // New script VM emulates reload: persistent contents aren't trusted until fresh identity verification.
 let b=fresh();assert.equal(b.aiCacheRead(k,false),null);await b.prepareAIAnswerCache();assert.equal(b.aiCacheRead(key(b),false),'A');assert.equal(key(b),k);
 user='200';let other=fresh();await other.prepareAIAnswerCache();assert.equal(other.aiCacheRead(key(other),false),null);assert.notEqual(key(other),k);
 // Unknown identity doesn't expose persisted answers or write over a good bucket.
 failure=true;let unknown=fresh();assert.equal(await unknown.prepareAIAnswerCache(),false);assert.equal(unknown.aiCacheRead(k,false),null);unknown.aiCacheWrite(k,'bad',generation(unknown));await flush(unknown);assert.ok(Array.from(store.values())[0].includes('"owner":"100"'));
 failure=false;user='100';now+=7*24*60*60*1000+1;let expired=fresh();await expired.prepareAIAnswerCache();assert.equal(expired.aiCacheRead(key(expired),false),null);
 // Clear persisted data and prevent pre-clear in-flight results from recreating it.
 const old=generation(b);await b.clearAIAnswerCache();b.aiCacheWrite(k,'late',old);await flush(b);assert.equal(store.size,0);let cleared=fresh();await cleared.prepareAIAnswerCache();assert.equal(cleared.aiCacheRead(key(cleared),false),null);
 // Corrupt/oversized storage is safely ignored.
 store.set('pta-ai-answer-cache-v2','{broken');let corrupt=fresh();assert.equal(await corrupt.prepareAIAnswerCache(),true);assert.equal(corrupt.aiCacheRead(key(corrupt),false),null);
 // Broken managers must not indefinitely block solving: bound both prior write queue and read.
 const stuckRead=fresh();stuckRead.setTimeout=(f,ms)=>setTimeout(f,ms===2000?5:ms);stuckRead.GM_getValue=()=>new Promise(()=>{});
 assert.equal(await stuckRead.prepareAIAnswerCache(),false);assert.equal(stuckRead.aiCacheRead(k,false),null);
 const stuckWrite=fresh();stuckWrite.setTimeout=(f,ms)=>setTimeout(f,ms===2000?5:ms);vm.runInContext('aiCacheStorageQueue=new Promise(function(){})',stuckWrite);
 assert.equal(await stuckWrite.prepareAIAnswerCache(),false);assert.equal(stuckWrite.aiCacheRead(k,false),null);
 let lateResolve;const lateRead=fresh();lateRead.setTimeout=(f,ms)=>setTimeout(f,ms===2000?5:ms);lateRead.GM_getValue=()=>new Promise(r=>lateResolve=r);
 assert.equal(await lateRead.prepareAIAnswerCache(),false);lateResolve(JSON.stringify({version:2,owner:'100',items:[[k,{answer:'late',time:now}]]}));await Promise.resolve();assert.equal(lateRead.aiCacheRead(k,false),null);
 // Async GM implementations are supported as well.
 let asyncGM=fresh();asyncGM.GM_getValue=async()=>null;asyncGM.GM_setValue=async(k,v)=>store.set(k,v);asyncGM.GM_deleteValue=async k=>store.delete(k);await asyncGM.prepareAIAnswerCache();asyncGM.aiCacheWrite(key(asyncGM),'A',generation(asyncGM));await flush(asyncGM);await asyncGM.clearAIAnswerCache();assert.equal(store.size,0);
 console.log('PASS: reload persistence, fresh identity gate, account isolation, unknown identity, TTL, clear/late result, corrupt storage, sync/async GM');
})().catch(e=>{console.error(e);process.exitCode=1});
