const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    var pendingPageWrites ='),src.indexOf('    async function solveChoicePage'))+'solveSmallQuestionPage';
const tick=()=>new Promise(r=>setImmediate(r));
function harness({continuous=true,fail=false,stop=false,saveStatus='saved'}={}){
 const env={saves:0,writes:[],resolvers:[],continuous};const state={running:true,runId:1,concurrentEnabled:true,concurrency:3};env.state=state;
 const root={contains:()=>true};const groups=Array.from({length:3},(_,id)=>({id,problem:{closest:()=>root,contains:()=>true},inputs:[{id}]}));
 env.groups=groups;
 const context={markQuestionWritten(){},captureInitialProgress(){},reconcileLocalProgress(){},setQuestionProgress(){},canWriteQuestions:()=>true,document:{documentElement:{contains:()=>true}},questionSaveControl:()=>({}),textOf:()=>'',questionCommitQueue:Promise.resolve(),location:{href:'https://pintia.cn/test'},state,isContinuous:()=>env.continuous,normalizeConcurrency:()=>3,groupFillInputs:()=>groups,log(){},setProgress(){},saveQuestion:async(problem,inputs)=>{env.saves++;env.savedInputs=inputs;return {status:saveStatus}},concurrentJob:g=>env.skipJobs?null:({...g,label:String(g.id),valid:()=>true,request:()=>new Promise((resolve,reject)=>{env.resolvers[g.id]=()=>fail&&g.id===1?reject(Error('error')):resolve('answer')}),apply:()=>{env.writes.push(g.id);return 1}})};
 env.solve=vm.runInNewContext(code,context);return env;
}
(async()=>{
 let h=harness(),p=h.solve('fill');await tick();h.resolvers[1]();await tick();assert.equal(h.saves,0);h.resolvers[0]();await tick();assert.equal(h.saves,0);h.resolvers[2]();await p;assert.equal(h.saves,1);assert.equal(h.savedInputs.length,3);assert.deepEqual(h.writes,[1,0,2]);
 h=harness({continuous:false});p=h.solve('fill');await tick();assert.equal(h.resolvers.length,1);h.resolvers[0]();await p;assert.equal(h.saves,1);assert.equal(h.savedInputs.length,1);
 h=harness({fail:true});p=h.solve('fill');await tick();h.resolvers.forEach(r=>r());await p;assert.equal(h.saves,0);assert.equal(h.state.pageErrors,true);
 h=harness();p=h.solve('fill');await tick();h.state.running=false;h.resolvers.forEach(r=>r());await p;assert.equal(h.saves,0);assert.equal(h.writes.length,0);
 h=harness({saveStatus:'unverified'});p=h.solve('fill');await tick();h.resolvers.forEach(r=>r());await p;assert.equal(h.saves,1);assert.equal(h.state.pageErrors,true);
 h=harness();p=h.solve('fill');await tick();h.resolvers[0]();await tick();h.groups[0].inputs[0].value='manual edit';h.resolvers[1]();h.resolvers[2]();await p;assert.equal(h.saves,0);assert.equal(h.state.pageErrors,true);
 h=harness({fail:true});p=h.solve('fill');await tick();h.resolvers.forEach(r=>r());await p;h.skipJobs=true;h.state.pageErrors=false;await h.solve('fill');assert.equal(h.state.pageErrors,true);assert.equal(h.saves,0);
 console.log('PASS: one page Save after all writes, single mode Save, failure/stop/unverified guards');
})().catch(e=>{console.error(e);process.exitCode=1});
