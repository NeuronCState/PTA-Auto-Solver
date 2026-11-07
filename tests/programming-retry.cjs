const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const input='假设图书记录为“Java程序设计： 34；Web程序设计： 56；JSP程序设计：20”，价格为整数，以中文；分隔。';
const output='接受键盘录入，输出所有书目的总价格。';
// Synthetic samples: real diagnostic snapshots deliberately omit editor content.
const sampleIn='测试书：1；另一书：2',sampleOut='3';
const raw='图书价格汇总\n输入格式:\n'+input+'\n输出格式:\n'+output+'\n输入样例:\n'+sampleIn+'\n输出样例:\n'+sampleOut+'\n提示:\n额外要求必须保留';
const heading=text=>({tagName:'H3',text});const editor=doc=>({tagName:'DIV',doc,classList:{contains:c=>c==='cm-editor'}});
const nodes=[heading('输入格式:'),heading('输出格式:'),heading('输入样例:'),editor(sampleIn),heading('输出样例:'),editor(sampleOut),heading('提示:')];
const problem={querySelectorAll:()=>nodes};
const cleanText=vm.runInNewContext(section('    function cleanText(', '    function nearestProblem(')+'cleanText');
const q=vm.runInNewContext(section('    function problemCodeBlocks(', '    function extractFunction(')+'extractProgramming(problem)',{problem,questionText:()=>cleanText(raw),textOf:n=>n.text,cleanText,getEditorDoc:e=>e.doc,queryAll:selector=>selector==='.cm-editor'?nodes.filter(n=>n.doc):[]});
assert.equal(q.input,input);assert.equal(q.output,output);assert.equal(q.sampleInput,sampleIn);assert.equal(q.sampleOutput,sampleOut);assert.match(q.fullText,/额外要求必须保留/);assert.equal(q.frameworkCode,'');
const parser=vm.runInNewContext(section('    function parseSubmissionScore(', '    function readSubmissionScore')+'parseSubmissionScore');
assert.equal(parser('提交结果 状态 部分正确 分数 2 / 10 评测详情 测试点1 答案错误 提交代码 String text="Running 等待";').score,2);
assert.equal(parser('提交结果 状态 正在评测 分数 - / 10 提交代码 "答案正确 分数 10 / 10"'),null);
// Capture the result before script-driven dismissal, only when diagnostics is enabled.
{
 const events=[];const context={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},aiCacheRemove(){},questionText:()=>"stable problem",ensureCompilerLanguage:async editor=>({editor,language:"java"}),compilerStillMatches:()=>true,editorEmpty:()=>true,diagnostics:{enabled:true},captureDiagnostic:reason=>events.push(reason),submissionResultContainer:()=>({}),queryAll:()=>[{text:'确认',getAttribute:()=>null,click:()=>events.push('click')}],textOf:n=>n.text};
 const close=vm.runInNewContext(section('    function closeSubmissionResult(', '    async function waitForSubmitButton')+'closeSubmissionResult',context);
 close();assert.deepEqual(events,['before-close-submission-result','click']);events.length=0;context.diagnostics.enabled=false;close();assert.deepEqual(events,['click']);
}
(async()=>{
 let editorCode='',calls=0;const prompts=[];const ed={};
 const context={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},aiCacheRemove(){},questionText:()=>"stable problem",ensureCompilerLanguage:async editor=>({editor,language:"java"}),compilerStillMatches:()=>true,editorEmpty:()=>true,location:{href:'https://pintia.cn/test'},state:{running:true,runId:1,language:'java'},queryAll:()=>[problem],document:{documentElement:{contains:()=>true}},setQuestionProgress(){},submissionSnapshot:()=>'',closeSubmissionResult(){},extractProgramming:()=>q,editableEditor:()=>ed,isSkipAnswered:()=>true,getEditorDoc:()=>editorCode,writeEditor:(_,code)=>{editorCode=code;return true},normalizeAnswer:x=>x,problemImages:()=>[],resolveLanguage:()=> 'java',languageLabel:()=> 'Java',waitForSubmitButton:async()=>({click(){}}),sleep:async()=>{},log(){},setStatus(){},waitForSubmissionScore:async()=>{editorCode='changed after submit';return calls===1?{score:2,total:10,feedback:'测试点 1 答案错误 得分 0/8'}:{score:10,total:10,feedback:'答案正确'}}};
 const prompt=vm.runInNewContext(section('    function promptFor(', '    function baseUrl(')+'promptFor',context);
 context.solveOne=async(type,data)=>{calls++;prompts.push(prompt(type,data,2));return calls===1?'public class Main { /* submitted first */ }':'public class Main { /* second */ }';};
 await vm.runInNewContext(section('    async function submitCode(', '    async function autoSolve(')+'submitCode("programming")',context);
 assert.equal(calls,2);assert.match(prompts[1],/【上次提交代码】\npublic class Main \{ \/\* submitted first \*\/ \}/);assert.match(prompts[1],/测试点 1 答案错误 得分 0\/8/);assert.match(prompts[1],/实际得分：2 \/ 10/);assert.match(prompts[1],/额外要求必须保留/);assert.ok(!prompts[1].includes('changed after submit'));
 console.log('PASS: programming section boundaries, full statement, source-safe grading, submitted-code snapshot and retry prompt feedback');
})().catch(e=>{console.error(e);process.exitCode=1});
