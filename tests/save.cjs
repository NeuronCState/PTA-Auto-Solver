const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=source.slice(source.indexOf('    var questionSaveQueue'),source.indexOf('    async function submitCode'));
function fixture(options={}) {
 let clock=0,clicks=0,afterClick=0,active=false;
 const location={href:'https://pintia.cn/problem-sets/test/exam/problems/type/2'};
 const state={running:true,runId:1};
 const input={value:'B',checked:true};
 const main={};
 const problem={closest:s=>s==='main'?main:null,contains:n=>n===input};
 const status={text:'保存 1 题答案待保存'};
 const button={text:'保存',parentElement:status,disabled:false,getClientRects:()=>[{}],getAttribute:()=>null,closest:s=>s==='.sticky.bottom-0'?{}:null,click(){if(options.noOverlap)assert.equal(active,false);clicks++;afterClick=0;active=true;if(options.throwClick)throw new Error('unavailable');}};
 const submit={...button,text:'提交本题作答',click(){throw new Error('Must not submit');}};
 const nodes=new Set([problem,input]);
 const context={state,location,Date:{now:()=>clock},document:{documentElement:{contains:n=>nodes.has(n)}},textOf:n=>n.text||'',queryAll:(s,root)=>root===problem?(options.local?[button]:[]):(options.missing?[submit]:options.ambiguous?[button,{...button}]:[button,submit]),sleep:async ms=>{
  clock+=ms;
  if(active){afterClick++;if(!options.stall&&afterClick>=2){status.text='保存';active=false;}}
  if(options.error&&clicks)status.text='保存失败';
  if(options.navigate || options.navigateAfterClick && clicks)location.href='https://pintia.cn/other';
  if(options.cancelAfterClick && clicks)state.running=false;
  if(options.restartAfterClick && clicks && state.runId===1){state.runId=2;state.running=true;}
  if(options.stop)state.running=false;
  if(options.edit)input.value='changed';
  if(options.replaced)nodes.delete(input);
 }};
 const api=vm.runInNewContext(code+'({saveQuestion,questionSaveControl,canWriteQuestions})',context);
 return {api,problem,input,button,status,state,location,clicks:()=>clicks,clock:()=>clock};
}
(async()=>{
 let f=fixture();let r=await f.api.saveQuestion(f.problem,[f.input]);assert.equal(r.status,'saved');assert.equal(f.clicks(),1);
 f=fixture({local:true});assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'saved');
 for(const name of ['missing','ambiguous']) {f=fixture({[name]:true});assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,name);assert.equal(f.clicks(),0);}
 for(const name of ['navigate','stop','edit','replaced']) {f=fixture({[name]:true});assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'cancelled');assert.equal(f.clicks(),0);}
 f=fixture({stall:true});assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'unverified');assert.equal(f.clicks(),1);
 f=fixture({error:true});assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'failed');assert.equal(f.clicks(),1);
 f=fixture();f.button.disabled=true;assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'failed');assert.equal(f.clicks(),0);
 // Simulate a fresh dirty question only after the previous queued save resolves.
 f=fixture({noOverlap:true});const first=f.api.saveQuestion(f.problem,[f.input]);
 const second=f.api.saveQuestion(f.problem,[f.input]);
 first.then(()=>{f.status.text='保存 1 题答案待保存';});
 assert.equal((await first).status,'saved');assert.equal((await second).status,'saved');assert.equal(f.clicks(),2);
 // Empty status without an observed dirty transition is never called confirmed saved.
 f=fixture();f.status.text='保存';assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'unverified');
 // A clicked save retains the shared barrier after cancellation until its
 // pending indicator clears, even if a new run has already begun.
 for(const option of ['cancelAfterClick','restartAfterClick']) {
  f=fixture({[option]:true});
  r=await f.api.saveQuestion(f.problem,[f.input]);
  assert.equal(r.status,'cancelled');assert.equal(r.clicked,true);
  assert.ok(f.clock()>=300);assert.equal(f.api.canWriteQuestions(),true);assert.equal(f.clicks(),1);
 }
 for(const options of [{cancelAfterClick:true,stall:true},{restartAfterClick:true,stall:true},{navigateAfterClick:true}]) {
  f=fixture(options);r=await f.api.saveQuestion(f.problem,[f.input]);
  assert.equal(r.status,'cancelled');assert.equal(r.clicked,true);
  assert.ok(f.clock()>=8000);assert.equal(f.api.canWriteQuestions(),false);
  f.state.running=true;f.state.runId++;
  assert.equal((await f.api.saveQuestion(f.problem,[f.input])).status,'unverified');
  assert.equal(f.clicks(),1);
 }
 f=fixture({throwClick:true});r=await f.api.saveQuestion(f.problem,[f.input]);
 assert.equal(r.status,'failed');assert.equal(r.clicked,true);assert.equal(f.api.canWriteQuestions(),false);
 console.log('PASS: scoped Save only, global footer fallback, no submit, confirmation, timeout, guards and serialized saves');
})().catch(e=>{console.error(e);process.exitCode=1;});
