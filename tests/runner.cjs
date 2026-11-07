const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=source.slice(source.indexOf('    async function autoSolve()'),source.indexOf('    var CSS ='))+'autoSolve()';
async function run({types=['judge','choice','fill'],continuous=true,fail=false,incomplete=false,stale=false,codeScore=true,sameType=false}={}){
 let index=0,moves=0;const processed=[],state={running:true,runId:1},location={href:'https://pintia.cn/test/1'};
 const solve=async()=>{processed.push(types[index]);if(fail)state.pageErrors=true;if(stale)state.runId++;return 1;};
 const ctx={state,location,typeRoute:()=>({id:String(index+1)}),detectType:()=>types[index],setQuestionProgress(){},log(){},languageLabel:()=> 'Java',PROVIDERS:{undefined:{name:'mock'}},solveJudgePage:solve,solveChoicePage:solve,solveFillPage:solve,solveProgramFillPage:solve,submitCode:async()=>{await solve();return {processed:1,fullScore:codeScore}},isContinuous:()=>continuous,lastPage:()=>!sameType||moves>0,goNext:()=>{moves++;return true},questionProgress:()=>({current:incomplete?0:1,total:1}),goNextType:async()=>{if(++index>=types.length)return false;location.href='https://pintia.cn/test/'+index;return true},sleep:async()=>{}};
 await vm.runInNewContext(code,ctx);return {processed,moves,index};
}
(async()=>{
 assert.deepEqual((await run()).processed,['judge','choice','fill']);
 assert.deepEqual((await run({continuous:false})).processed,['judge']);
 assert.deepEqual((await run({fail:true})).processed,['judge']);
 assert.deepEqual((await run({incomplete:true})).processed,['judge']);
 assert.deepEqual((await run({stale:true})).processed,['judge']);
 assert.deepEqual((await run({types:['programming','choice'],codeScore:false})).processed,['programming']);
 const same=await run({sameType:true});assert.deepEqual(same.processed,['judge','judge','choice','fill']);assert.equal(same.moves,1);
 console.log('PASS: runner next-type integration, current-type priority, continuous/save/error/stale/grade guards');
})().catch(e=>{console.error(e);process.exitCode=1});
