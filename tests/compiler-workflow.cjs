const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    async function submitCode('),src.indexOf('    async function autoSolve('))+'submitCode("function")';
async function run({existing='',target='',skip=true,mutate=false,switchFails=false,changeQuestion=false}={}){
 const calls=[];const original={doc:existing},replacement={doc:target};let switched=false,question='stable problem';
 const ctx={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},questionText:()=>question,state:{running:true,runId:1,language:'auto'},location:{href:'https://pintia.cn/test'},document:{documentElement:{contains:()=>true}},queryAll:()=>[{}],setQuestionProgress(){},submissionSnapshot:()=>'',closeSubmissionResult(){},extractFunction:()=>({desc:switched?'new language interface':'old interface'}),editableEditor:prefer=>prefer&&original.doc?null:original,isSkipAnswered:()=>skip,editorEmpty:e=>!e.doc,ensureCompilerLanguage:async()=>{calls.push('compiler');if(switchFails)throw Error('unavailable');switched=true;return {editor:replacement,language:'java'}},getEditorDoc:e=>e.doc,compilerStillMatches:()=>true,solveOne:async(_,data)=>{calls.push('model');assert.match(data.description,/new language interface/);assert.equal(data.language,'java');if(mutate)replacement.doc='user change';if(changeQuestion)question='new question same URL';return 'generated';},writeEditor:(e,text)=>{calls.push('write');e.doc=text;return true},normalizeAnswer:x=>x,problemImages:()=>[],waitForSubmitButton:async()=>({click:()=>calls.push('submit')}),sleep:async()=>{},log(){},setStatus(){},waitForSubmissionScore:async()=>({score:10,total:10})};
 let result,error;try{result=await vm.runInNewContext(code,ctx)}catch(e){error=e}return {calls,result,error,replacement};
}
(async()=>{
 let r=await run();assert.deepEqual(r.calls,['compiler','model','write','submit']);assert.equal(r.result.fullScore,true);
 r=await run({existing:'existing answer'});assert.deepEqual(r.calls,[]);assert.equal(r.result.skipped,true);
 r=await run({target:'existing Java draft'});assert.deepEqual(r.calls,['compiler']);assert.equal(r.result.skipped,true);assert.equal(r.replacement.doc,'existing Java draft');
 r=await run({mutate:true});assert.match(r.error.message,/发生变化/);assert.deepEqual(r.calls,['compiler','model']);assert.equal(r.replacement.doc,'user change');
 r=await run({changeQuestion:true});assert.match(r.error.message,/发生变化/);assert.deepEqual(r.calls,['compiler','model']);
 r=await run({switchFails:true});assert.deepEqual(r.calls,['compiler']);assert.equal(r.error.message,'unavailable');
 console.log('PASS: compiler-before-generation, refreshed function context, original/target skip, manual-edit and switch-failure guards');
})().catch(e=>{console.error(e);process.exitCode=1});
