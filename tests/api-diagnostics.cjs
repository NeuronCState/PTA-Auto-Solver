const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=src.slice(src.indexOf('    var apiDiagnostics ='),src.indexOf('    // Opt-in diagnostics:'));
const endpoint='https://pintia.cn/api/problem-sets?filter=%7B%7D&page=2&limit=30&token=SECRET';
let timers=new Map(),timerId=0,calls=[],lastResponse;
class XHR {
 constructor(){this.listeners=[];this.responseType='';this.status=200;this.responseURL=endpoint;this.responseText='{"total":72,"problemSets":[{"id":"1234567890123","name":"PRIVATE NAME","score":9,"token":"SECRET"}]}';}
 open(...args){this.args=args;return 'open-result';}send(...args){this.sent=args;return 'send-result';}
 addEventListener(event,fn,options){assert.equal(event,'loadend');assert.equal(options.once,true);this.listeners.push(fn);}
 removeEventListener(event,fn){this.listeners=this.listeners.filter(f=>f!==fn);}
 finish(){this.listeners.splice(0).forEach(f=>f());}
}
function response(json,url=endpoint,status=200){const r=new Response(JSON.stringify(json),{status});Object.defineProperty(r,'url',{value:url});return r;}
const originalFetch=function(...args){calls.push([this,args]);return Promise.resolve(lastResponse);};
const realm={fetch:originalFetch,XMLHttpRequest:XHR};const originalOpen=XHR.prototype.open,originalSend=XHR.prototype.send;
const context={unsafeWindow:realm,window:realm,URL,Blob,Set,WeakMap,TextDecoder,Uint8Array,Promise,Number,JSON,Date,location:{hostname:'pintia.cn',protocol:'https:'},document:{getElementById:()=>null},toast(){},setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id){timers.delete(id);}};
vm.createContext(context);vm.runInContext(section,context);
const api=context;
const state=()=>vm.runInContext('apiDiagnostics',context);
const wait=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
(async()=>{
 assert.equal(state().enabled,false);assert.equal(realm.fetch,originalFetch);
 for(const u of ['https://other.test/api/problem-sets','https://pintia.cn.evil/api/problem-sets','https://u:p@pintia.cn/api/problem-sets','/api/u/current','/api/exams/1/submissions','/api/problem-sets/1/exam-problems/2'])assert.equal(api.apiDiagnosticTarget(u,'GET'),null);
 assert.equal(api.apiDiagnosticTarget(endpoint,'POST'),null);
 const target=api.apiDiagnosticTarget(endpoint,'GET');assert.equal(target.path,'/api/problem-sets');assert.equal(target.page,2);assert.equal(target.limit,30);assert.ok(!JSON.stringify(target).includes('SECRET'));
 assert.equal(api.apiDiagnosticTarget('/api/exams/123/problem-sets/456/problem-status','GET').path,'/api/exams/:id/problem-sets/:id/problem-status');
 const privateData={total:72,token:'SECRET',email:'PRIVATE EMAIL',password:'PRIVATE PASSWORD',problemSets:[{id:'1234567890123',name:'PRIVATE NAME',endAt:'2026-01-01T00:00:00Z',score:8,userGroupId:'55555'}],userGroups:{'55555':{name:'PRIVATE CLASS'}},'PRIVATE KEY':9};
 const shaped=api.apiDiagnosticShape(privateData),encoded=JSON.stringify(shaped);assert.equal(shaped.total,72);assert.equal(shaped.problemSets.samples[0].score,8);
 for(const bad of ['SECRET','PRIVATE','1234567890123','55555','2026-01-01','token','email','password'])assert.ok(!encoded.includes(bad),bad);
 assert.equal(api.apiDiagnosticShape({score:'SECRET',id:9999999999999999}).id,'[number]');
 const giant={};let cursor=giant;for(let i=0;i<100;i++){cursor.data={};cursor=cursor.data;}assert.ok(JSON.stringify(api.apiDiagnosticShape(giant)).length<1000);
 api.startApiDiagnostics();assert.equal(state().enabled,true);assert.notEqual(realm.fetch,originalFetch);assert.ok([...timers.values()][0].ms<=300000 && [...timers.values()][0].ms>299000);
 lastResponse=response(privateData);const init={headers:{Authorization:'SECRET'},method:'GET'},receiver={custom:true};const promise=realm.fetch.call(receiver,endpoint,init);assert.equal(await promise,lastResponse);await wait();
 assert.equal(calls.length,1);assert.equal(calls[0][0],receiver);assert.equal(calls[0][1][1],init);assert.equal(state().records.length,1);assert.ok(!JSON.stringify(state().records).includes('SECRET'));
 // Original request/response remains usable, capture consumes only its clone.
 assert.deepEqual(await lastResponse.json(),privateData);
 lastResponse=response(privateData);await realm.fetch('https://model.invalid/v1/chat/completions',init);await realm.fetch(endpoint,{method:'POST'});await wait();assert.equal(state().records.length,1);
 let xhr=new XHR();assert.equal(xhr.open('GET',endpoint,true),'open-result');assert.equal(xhr.send(null),'send-result');xhr.finish();assert.equal(state().records.length,2);assert.equal(xhr.responseText.includes('SECRET'),true);
 xhr=new XHR();xhr.open('GET','/api/u/current');xhr.send();xhr.finish();assert.equal(state().records.length,2);
 // Reopening the same XHR removes the old listener; even an already queued
 // old callback cannot read/attribute the new request's response.
 const reuseBase=state().records.length;
 xhr=new XHR();xhr.open('GET',endpoint);xhr.send();const oldCallback=xhr.listeners[0];
 xhr.open('GET','/api/u/current');xhr.send();oldCallback();xhr.finish();assert.equal(state().records.length,reuseBase);assert.equal(xhr.listeners.length,0);
 xhr.open('GET',endpoint);xhr.send();const previous=xhr.listeners[0];
 const next='https://pintia.cn/api/problem-sets/987/exam-problem-status';xhr.open('GET',next);xhr.responseURL=next;xhr.send();previous();assert.equal(state().records.length,reuseBase);
 xhr.finish();assert.equal(state().records.length,reuseBase+1);assert.equal(state().records.at(-1).request.path,'/api/problem-sets/:id/exam-problem-status');
 // A subsequent abort records no body and cannot overwrite an earlier record.
 xhr.open('GET',endpoint);xhr.send();xhr.status=0;xhr.responseURL='';xhr.finish();assert.equal(state().records.length,reuseBase+2);assert.equal(state().records.at(-1).response,undefined);
 lastResponse=response({token:'SECRET'},endpoint,403);await realm.fetch(endpoint);await wait();assert.equal(state().records.at(-1).status,403);assert.equal(state().records.at(-1).response,undefined);
 lastResponse=response(privateData,'https://passport.pintia.cn/login');await realm.fetch(endpoint);await wait();assert.equal(state().records.at(-1).response,undefined);
 lastResponse=response({data:'x'.repeat(600000)});await realm.fetch(endpoint);await wait();assert.equal(state().records.at(-1).note,'body size limit');
 // Stop restores only owned wrappers; stale responses and callbacks cannot add.
 const before=state().records.length;api.stopApiDiagnostics();assert.equal(state().enabled,false);assert.equal(realm.fetch,originalFetch);assert.equal(XHR.prototype.open,originalOpen);assert.equal(XHR.prototype.send,originalSend);api.addApiDiagnostic(target,200,privateData,null,state().generation-1);assert.equal(state().records.length,before);
 api.startApiDiagnostics();const thirdParty=()=>{};realm.fetch=thirdParty;api.stopApiDiagnostics();assert.equal(realm.fetch,thirdParty);realm.fetch=originalFetch;
 api.startApiDiagnostics();const gen=state().generation;for(let i=0;i<70;i++)api.addApiDiagnostic(target,200,{total:1},null,gen);assert.equal(state().records.length,60);assert.equal(state().enabled,false);assert.ok(state().bytes<=256*1024);
 assert.ok(!section.includes('getAllResponseHeaders'));assert.ok(!section.includes('getResponseHeader'));assert.ok(!section.includes('localStorage'));assert.ok(!section.includes('document.cookie'));assert.ok(!section.includes('setRequestHeader'));
 const settings=src.slice(src.indexOf('<details class="pta-field"><summary>开发者选项'),src.indexOf('<div class="pta-help">配置均'));
 assert.ok(settings.includes('pta-api-diagnostic-toggle'));assert.ok(settings.includes('pta-diagnostic-toggle'));assert.ok(!settings.includes('pta-help'));
 console.log('PASS: opt-in GET whitelist, path/query stripping, strict value/key projection, fetch/XHR passthrough, size/count/time guards, restoration and no credential collection');
})().catch(e=>{console.error(e);process.exitCode=1;});
