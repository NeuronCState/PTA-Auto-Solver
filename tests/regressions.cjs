const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
function section(start,end) { return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))); }
const parser = vm.runInNewContext(section('    function parseSubmissionScore(', '    function readSubmissionScore')+'parseSubmissionScore');
for (const text of ['提交结果 分数 0 / 20 等待评测', '提交结果 分数 0 / 20', '题目得分 20 / 20 答案正确', '提交结果 分数 0 / 20 Judging', '提交结果 分数 0 / 20 答案错误 评测中']) assert.equal(parser(text),null,text);
assert.equal(parser('提交结果 得分：0 / 20 答案错误').score,0);
assert.equal(parser('提交结果 分数 20 / 20 答案正确').score,20);
async function navigation(results, continuous=true) {
 let moves=0, count=0;
 const context={state:{running:true}, detectType:()=> 'programming',setQuestionProgress(){},log(){},languageLabel(){},PROVIDERS:{undefined:{name:'mock'}}, submitCode:async()=>{count++;return results.shift() || {processed:1,fullScore:false};},isContinuous:()=>continuous,lastPage:()=>false,goNext:()=>{moves++; return true;},sleep:async()=>{}};
 await vm.runInNewContext(section('    async function autoSolve()', '    var CSS =')+'autoSolve()',context);
 return {moves,count};
}
async function grading(sequence, previous='') {
 let clock=0;
 const context={state:{running:true}, Date:{now:()=>clock},submissionSnapshot:()=>sequence.shift()||'',parseSubmissionScore:parser,sleep:async(ms)=>{clock+=ms;}};
 return vm.runInNewContext(section('    async function waitForSubmissionScore(', '    async function solveChoicePage')+'waitForSubmissionScore(2000,'+JSON.stringify(previous)+')',context);
}
async function retryFeedback() {
 const prompts=[];
 const editor={};
 const results=[{score:12,total:20,feedback:'提交结果 分数 12 / 20 部分正确 检查点 3 运行超时'}, {score:20,total:20,feedback:'答案正确'}];
 const context={state:{running:true},queryAll:()=>[{}],setQuestionProgress(){},submissionSnapshot:()=>'',closeSubmissionResult(){},extractProgramming:()=>({desc:'test'}),editableEditor:()=>editor,isSkipAnswered:()=>true,getEditorDoc:()=>'',solveOne:async(type,prompt)=>{prompts.push(prompt.description);return 'code';},writeEditor:()=>true,normalizeAnswer:x=>x,problemImages:()=>[],resolveLanguage:()=> 'C',waitForSubmitButton:async()=>({click(){}}),sleep:async()=>{},log(){},setStatus(){},waitForSubmissionScore:async()=>results.shift(),document:{documentElement:{contains:()=>true}}};
 await vm.runInNewContext(section('    async function submitCode(', '    async function autoSolve')+'submitCode("programming")',context);
 assert.equal(prompts.length,2);
 assert.match(prompts[1],/12 \/ 20/);
 assert.match(prompts[1],/检查点 3 运行超时/);
}
async function nonProgrammingMode(name, continuous, skipFirst=false) {
 let calls=0;
 const groups=Array.from({length:3},(_,index)=>({answered:skipFirst && index===0,problem:{scrollIntoView(){}},inputs:[{value:''},{value:''}],editor:{}}));
 const context={state:{running:true},collectGroups:()=>groups,groupFillInputs:()=>groups,groupProgramFills:()=>groups,isSkipAnswered:()=>true,selected:g=>g.answered,isContinuous:()=>continuous === 'disable-during-request' ? calls === 0 : continuous,setQuestionProgress(){},sleep:async()=>{},extractOptions:()=>[],questionText:()=>'',problemImages:()=>[],solveOne:async()=>{calls++;return 'A|B';},writeChoice:()=>true,writeInput:(input,value)=>{input.value=value;return true;},normalizeAnswer:x=>x,log(){},getEditorDoc:()=> '______',resolveLanguage:()=> 'C'};
 await vm.runInNewContext(section('    async function solveChoicePage','    async function submitCode')+name+'("choice")',context);
 return calls;
}
(async()=>{
 for (const name of ['solveChoicePage','solveJudgePage','solveFillPage','solveProgramFillPage']) {
  assert.equal(await nonProgrammingMode(name,false),1,name+' single');
  assert.equal(await nonProgrammingMode(name,true),3,name+' continuous');
  assert.equal(await nonProgrammingMode(name,'disable-during-request'),1,name+' toggled off');
 }
 assert.equal(await nonProgrammingMode('solveChoicePage',false,true),1);
 assert.equal(await nonProgrammingMode('solveJudgePage',false,true),1);
 await retryFeedback();
 assert.deepEqual(await navigation([{processed:0,fullScore:false,skipped:true},{processed:1,fullScore:true},{processed:1,fullScore:false}]),{moves:2,count:3});
 assert.deepEqual(await navigation([{processed:0,fullScore:false}]),{moves:0,count:1});
 assert.deepEqual(await navigation([{processed:0,fullScore:false,skipped:true}],false),{moves:0,count:1});
 const final='提交结果 分数 20 / 20 答案正确';
 assert.equal((await grading(['提交结果 分数 0 / 20 评测中',final])).score,20);
 assert.equal(await grading([final,final,final,final],final),null);
 assert.equal(await grading(['提交结果 分数 0 / 20','提交结果 分数 0 / 20']),null);
 assert.equal((await grading(['提交结果 分数 0 / 20 评测中','提交结果 分数 0 / 20 答案错误'])).score,0);
 assert.equal(parser('提交结果 分数 12 / 20 部分正确').score,12);
 console.log('PASS: pending/zero/stale scores, skip navigation, missing editor stop, continuous off');
})().catch(e=>{console.error(e);process.exitCode=1;});
