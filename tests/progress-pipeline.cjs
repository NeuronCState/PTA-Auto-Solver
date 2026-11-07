const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let savedCount=6,release,skip=false;const views=[];
 const inputs=[{type:'radio',checked:false,value:'A',closest:()=>null},{type:'radio',checked:false,value:'B',closest:()=>null}];
 const problem={id:'q1',getAttribute:n=>n==='id'?'q1':null,contains:n=>inputs.includes(n),closest:()=>problem};const group={problem,inputs};
 const context={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},state:{running:true,runId:1,concurrentEnabled:true,concurrency:3,language:'auto'},location:{href:'https://pintia.cn/problem-sets/demo/exam/problems/type/2'},document:{documentElement:{contains:()=>true}},savedQuestionProgress:()=>({current:savedCount,total:41}),canWriteQuestions:()=>true,isContinuous:()=>false,isSkipAnswered:()=>skip,selected:g=>g.inputs.some(i=>i.checked),collectGroups:()=>[group],questionText:()=> 'q',textOf:()=> 'R2-1',extractOptions:()=>inputs.map(i=>({label:i.value,text:i.value,input:i})),problemImages:()=>[],resolveLanguage:()=> 'java',solveOne:async()=> 'B',writeChoice:()=>{inputs[0].checked=false;inputs[1].checked=true;return true},normalizeConcurrency:()=>3,log(){},saveQuestion:()=>new Promise(r=>{release=r}),setQuestionProgress:()=>views.push(api.questionProgress().current)};
 const api=vm.runInNewContext(part('    function questionProgress()', '    function savedQuestionProgress()')+part('    function concurrentJob(', '    // Small-question pages use')+'({solveSmallQuestionPage,questionProgress})',context);
 let pending=api.solveSmallQuestionPage('choice');await tick();assert.equal(api.questionProgress().current,7);assert.equal(savedCount,6);assert.ok(views.includes(7));
 savedCount=7;release({status:'saved'});await pending;assert.equal(api.questionProgress().current,7);
 pending=api.solveSmallQuestionPage('choice');await tick();release({status:'saved'});await pending;assert.equal(api.questionProgress().current,7); // rewriting answered question does not count again
 console.log('PASS: live progress increments before page Save and reconciles without double counting');
})().catch(e=>{console.error(e);process.exitCode=1});
