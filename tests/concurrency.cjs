const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(limit=3,count=6) {
 const state={running:true,runId:1,concurrentEnabled:true,concurrency:limit};
 const env={state,continuous:true,current:true,started:[],written:[],inflight:0,peak:0,resolvers:[],logs:[]};
 const ctx={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},markQuestionWritten(){},captureInitialProgress(){},reconcileLocalProgress(){},setQuestionProgress(){},canWriteQuestions:()=>true,rememberPageWrite(){},questionCommitQueue:Promise.resolve(),state,isContinuous:()=>env.continuous,normalizeConcurrency:v=>Math.max(1,Math.min(10,Math.round(Number(v)||3))),log:m=>env.logs.push(m),setProgress(){}};
 env.run=vm.runInNewContext(section('    function runConcurrentJobs(', '    async function solveSmallQuestionPage')+'runConcurrentJobs',ctx);
 env.jobs=Array.from({length:count},(_,id)=>({label:String(id),save:async()=>({status:'saved'}),valid:()=>true,request:()=>{env.started.push(id);env.inflight++;env.peak=Math.max(env.peak,env.inflight);return new Promise((resolve,reject)=>{env.resolvers[id]={resolve:x=>{env.inflight--;resolve(x)},reject:()=>{env.inflight--;reject(new Error('private response must not be logged'))}}})},apply:answer=>{env.written.push([id,answer]);return 1}}));
 return env;
}
async function settle(h) {while(h.resolvers.some(Boolean)||h.inflight){for(let i=0;i<h.resolvers.length;i++)if(h.resolvers[i]){const r=h.resolvers[i];h.resolvers[i]=null;r.resolve('answer'+i)}await tick();}}
(async()=>{
 let h=harness(3),p=h.run(h.jobs,()=>h.current);await tick();assert.deepEqual(h.started,[0,1,2]);
 h.resolvers[2].resolve('answer2');h.resolvers[2]=null;await tick();assert.deepEqual(h.started,[0,1,2,3]);
 await settle(h);let r=await p;assert.equal(r.written,6);assert.equal(h.peak,3);assert.deepEqual(h.written[0],[2,'answer2']);
 h=harness(10);h.continuous=false;p=h.run(h.jobs,()=>h.current);await tick();assert.deepEqual(h.started,[0]);await settle(h);assert.equal((await p).written,1);
 h=harness(3);p=h.run(h.jobs,()=>h.current);await tick();h.continuous=false;await settle(h);await p;assert.equal(h.started.length,3);
 h=harness(2);p=h.run(h.jobs,()=>h.current);await tick();h.resolvers[0].reject();h.resolvers[0]=null;await tick();await settle(h);r=await p;assert.equal(r.failed,1);assert.equal(r.written,5);assert.ok(!h.logs.join().includes('private response'));
 h=harness(2);p=h.run(h.jobs,()=>h.current);await tick();h.current=false;await settle(h);await p;assert.equal(h.started.length,2);assert.equal(h.written.length,0);
 h=harness(3);p=h.run(h.jobs,()=>h.current);await tick();h.state.concurrency=1;h.resolvers[0].resolve('a');h.resolvers[0]=null;await tick();assert.equal(h.started.length,3);await settle(h);await p;assert.equal(h.started.length,6);
 h=harness(20,15);p=h.run(h.jobs,()=>h.current);await tick();assert.equal(h.started.length,10);await settle(h);assert.equal((await p).written,15);assert.equal(h.peak,10);
 h=harness(1);let checks=0;h.jobs[0].valid=()=>++checks===1;p=h.run([h.jobs[0]],()=>h.current);assert.equal((await p).failed,1);assert.equal(h.started.length,0);
 h=harness();p=h.run([],()=>h.current);assert.equal((await p).written,0);
 // Real per-question binding checks. Mutated or detached inputs invalidate old results.
 const input={value:'',checked:false,disabled:false,readOnly:false,attached:true};
 const group={problem:{attached:true,contains:n=>n===input},inputs:[input]};
 const doc={documentElement:{contains:n=>n.attached}};
 let description='q',answer='hello';
 const ctx={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},markQuestionWritten(){},captureInitialProgress(){},reconcileLocalProgress(){},setQuestionProgress(){},canWriteQuestions:()=>true,document:doc,state:{language:'auto'},questionText:()=>description,extractOptions:()=>null,problemImages:()=>[],resolveLanguage:()=> 'java',getEditorDoc:()=>'',normalizeAnswer:x=>x,writeInput:(i,v)=>{i.value=v;return true},solveOne:async()=>answer,isSkipAnswered:()=>false};
 const make=vm.runInNewContext(section('    function concurrentJob(', '    function runConcurrentJobs')+'concurrentJob',ctx);
 let job=make(group,'fill',0);assert.equal(job.valid(),true);assert.equal(await job.request(),'hello');assert.equal(job.apply('x|y'),0);assert.equal(input.value,'');
 input.value='manual';assert.equal(job.valid(),false);input.value='';input.attached=false;assert.equal(job.valid(),false);input.attached=true;description='new q';assert.equal(job.valid(),false);description='q';assert.equal(job.valid(),true);assert.equal(job.apply('answer'),1);assert.equal(input.value,'answer');
 // Request cancellation settles even if the transport's abort callback never fires.
 let aborts=0,options;
 const reqCtx={state:{provider:'x',configs:{x:{model:'m'}}},PROVIDERS:{x:{}},providerReady:()=>true,authHeaders:()=>({}),endpoint:()=> 'https://invalid.test',GM_xmlhttpRequest:o=>{options=o;return {abort(){aborts++}}},Promise,Error};
 const request=vm.runInNewContext(section('    function requestAI(', '    function solveOne')+'requestAI',reqCtx);
 const controller=new AbortController();p=request([],1,0,controller.signal);controller.abort();await assert.rejects(p,/停止/);assert.equal(aborts,1);
 console.log('PASS: concurrent caps, out-of-order binding, single/stop behavior, failures, stale inputs, incomplete blanks, abort');
})().catch(e=>{console.error(e);process.exitCode=1});
