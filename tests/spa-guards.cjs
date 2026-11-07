const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const part=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const A='https://pintia.cn/problem-sets/a/exam/problems/type/2',B='https://pintia.cn/problem-sets/a/exam/problems/type/4';
 let writes=0,saves=0,clears=0,reply;const handlers={};
 const location={href:A},state={running:true,runId:1,routeRevision:0,concurrency:1};
 const oldController=new AbortController();const problem={contains:()=>true,closest:()=>problem};const group={problem,inputs:[{}]};
 const ctx={state,location,AbortController,activeSolveController:oldController,localAnswerProgress:{current:9},document:{documentElement:{contains:()=>true}},window:{addEventListener:(event,handler)=>handlers[event]=handler},history:{pushState:(_,__,url)=>{location.href=url;return 'ok'},replaceState:(_,__,url)=>{location.href=url}},setInterval:()=>1,stopClassCatalogue(){},refreshClassHome(){},stopAssistance:()=>clears++,setProgress(){},setQuestionProgress(){},captureInitialProgress(){},reconcileLocalProgress(){},markQuestionWritten(){},canWriteQuestions:()=>true,isContinuous:()=>true,normalizeConcurrency:()=>1,groupFillInputs:()=>[group],concurrentJob:()=>({problem,inputs:group.inputs,label:'one',valid:()=>true,request:()=>new Promise(r=>{reply=r}),apply:()=>{writes++;return 1}}),saveQuestion:async()=>{saves++;return {status:'saved'}},log(){}};
 const api=vm.runInNewContext(part('    var pendingPageWrites =','    // Small-question pages use')+part('    var spaObservedURL =','    function boot()')+'({solveSmallQuestionPage,installSPAGuards,observeSPARoute})',ctx);
 api.installSPAGuards();const pending=api.solveSmallQuestionPage('fill');await tick();
 assert.equal(ctx.history.pushState({},'',B),'ok');ctx.history.pushState({},'',A);assert.equal(state.routeRevision,2);assert.equal(clears,2);assert.equal(oldController.signal.aborted,true);assert.equal(ctx.activeSolveController.signal.aborted,false);
 reply('late answer');await pending;assert.equal(writes,0);assert.equal(saves,0);assert.equal(ctx.localAnswerProgress,null);
 ctx.history.replaceState({},'',A);assert.equal(state.routeRevision,2);handlers.popstate();assert.equal(state.routeRevision,3);
 location.href=B;api.observeSPARoute(false);assert.equal(state.routeRevision,4);assert.equal(clears,4);
 console.log('PASS: synchronous SPA epochs, rapid A-B-A, old-request abort, stale write/save rejection and progress/assistance reset');
})().catch(e=>{console.error(e);process.exitCode=1});
