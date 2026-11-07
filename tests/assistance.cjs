const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const a=src.indexOf('    // Answer assistance is opt-in'),b=src.indexOf('    function log(message, level)',a);
const code=src.slice(a,b);
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
assert.match(src,/pta-assistance-mode[^>]*type="checkbox">作答辅助/);
assert.match(src,/else if \(state.assistanceMode\) startAssistance\(\)/);
assert.match(src,/queryAll\('\.pta-assist, label, input, button', clone\)/);
assert.match(src,/clone.querySelectorAll\('\.pta-assist, #pta-root/);
assert.ok(!/writeInput\(|writeEditor\(|writeChoice\(|saveQuestion\(|submitCode\(|\.click\(/.test(code));
function node(){return {children:[],attrs:{},style:{},contains(n){return n===this||this.children.some(c=>c.contains(n))},getBoundingClientRect(){return {top:100,bottom:130,right:500}},isConnected:true,appendChild(n){this.children.push(n);return n},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this[k]=f},remove(){this.isConnected=false},focus(){},classList:{toggle(){}}};}
function context(){
 const controls={'pta-start':node()};const state={running:false,assistanceMode:true,provider:'test',language:'auto',concurrency:2,configs:{test:{model:'m',apiKey:'secret',thinking:3,maxTokens:8192,images:false}}};
 const ctx={prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){},window:{innerWidth:1000,innerHeight:800,addEventListener(){},removeEventListener(){}},renderAssistance(value){const n=node();n.textContent=value;return n},state,PROVIDERS:{test:{supportsImages:true}},location:{href:'https://pintia.cn/problem-sets/s/exam/problems/type/2'},document:{body:node(),addEventListener(k,f){this[k]=f},removeEventListener(k){delete this[k]},getElementById:k=>controls[k],createElement:node,documentElement:{contains:n=>n.isConnected!==false}},AbortController,setInterval:f=>{ctx.tick=f;return 1},clearInterval:()=>{},normalizeConcurrency:n=>Math.max(1,Math.min(10,Number(n)||1)),setProgress(){},setStatus(...args){ctx.status=args},toast(){},log(){},saveSettings(){},providerReady:()=>true,modelSupportsVision:()=>false,detectType:()=> 'choice',questionText:p=>p.text,problemImages:()=>[],resolveLanguage:()=> 'java',extractOptions:p=>p.options,collectGroups:()=>ctx.groups,groupFillInputs:()=>ctx.groups,groupProgramFills:()=>ctx.groups,getEditorDoc:e=>e.code};
 ctx.groups=[1,2,3].map(i=>({problem:Object.assign(node(),{text:'题'+i,options:[{label:'A',text:'1'},{label:'B',text:'2'}]}),inputs:[]}));
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.assistanceSections=e=>{const n=node();n.textContent=e.answer;return n};return ctx;
}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 // Full production start/queue/mount: settings passed, bounded concurrent dispatch,
 // no per-question UI until all replies settle, out-of-order binding, XSS-safe text.
 const ctx=context();const pending=[];ctx.requestAI=(messages,max,thinking,signal)=>new Promise((resolve,reject)=>pending.push({messages,max,thinking,signal,resolve,reject}));
 ctx.startAssistance();await flush();assert.equal(pending.length,2);assert.equal(ctx.groups[0].problem.children.length,0);
 assert.equal(pending[0].max,8192);assert.equal(pending[0].thinking,3);assert.match(pending[0].messages[1].content,/题1/);assert.ok(!pending[0].messages[1].content.includes('secret'));
 pending[1].resolve('【答案】B\n【解析】第二题');await flush();assert.equal(pending.length,3);assert.equal(ctx.groups[1].problem.children.length,0);
 pending[0].resolve('<script>alert(1)</script>');await flush();assert.equal(ctx.groups[0].problem.children.length,0);
 pending[2].reject(new Error('private response'));await flush();
 assert.equal(ctx.assistance.running,false);assert.equal(ctx.status[0],'部分解析失败');
 assert.equal(ctx.assistance.entries[0].answer,'<script>alert(1)</script>');
 assert.equal(ctx.assistance.entries[1].answer,'【答案】B\n【解析】第二题');
 assert.ok(!ctx.assistance.entries[2].answer.includes('private response'));
 const btn=ctx.groups[0].problem.children[0].children[0].children[1];
 btn.click({preventDefault(){},stopPropagation(){}});
 const overlay=ctx.assistance.modal,dialog=overlay.children[0],out=dialog.children[2];
 assert.equal(dialog.attrs.role,'dialog');assert.equal(out.textContent,'<script>alert(1)</script>');
 ctx.document.pointerdown({target:dialog});assert.equal(ctx.assistance.modal,overlay);
 ctx.document.pointerdown({target:node()});assert.equal(ctx.assistance.modal,null);
 btn.click({preventDefault(){},stopPropagation(){}});
 ctx.document.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(ctx.assistance.modal,null);
 ctx.groups[0].problem.text='改题';ctx.tick();assert.equal(ctx.assistance.entries.length,0);
 // Cancellation and late responses cannot publish UI or start more requests.
 const stopped=context(),p=[];stopped.requestAI=()=>new Promise(resolve=>p.push(resolve));stopped.startAssistance();await flush();stopped.stopAssistance(true);p.forEach(r=>r('late'));await flush();assert.equal(p.length,2);assert.ok(stopped.groups.every(g=>g.problem.children.length===0));
 // SPA navigation / settings change before response discards everything.
 for(const mutate of [c=>c.location.href+='?new',c=>c.state.configs.test.model='new-model']){
  const c=context(),pp=[];c.requestAI=()=>new Promise(resolve=>pp.push(resolve));c.startAssistance();await flush();mutate(c);pp.forEach(r=>r('stale'));await flush();assert.ok(c.groups.every(g=>g.problem.children.length===0));assert.equal(c.assistance.entries.length,0);
 }
 // Same-URL SPA DOM replacement: old nodes detached, replacement can have identical text.
 for (const changeURL of [false,true]) {
  const c=context(),pp=[];c.requestAI=(m,t,h,signal)=>new Promise(resolve=>pp.push({resolve,signal}));
  c.startAssistance();await flush();const old=c.groups;c.groups=context().groups;
  old.forEach(g=>g.problem.isConnected=false);if(changeURL)c.location.href+='?page=2';
  pp.forEach(p=>p.resolve('old reply'));await flush();
  assert.equal(pp.length,2);assert.equal(c.assistance.entries.length,0);
  assert.ok(c.groups.every(g=>g.problem.children.length===0));assert.ok(pp.every(p=>p.signal.aborted));
 }
 // Completed UI and open dialog are removed on either SPA path; key listener removed too.
 for (const mutation of [c=>c.location.href+='?page=2',c=>c.groups[0].problem.isConnected=false,c=>c.groups[0].problem.text='new question']) {
  const c=context();c.requestAI=()=>Promise.resolve('ready');c.startAssistance();await flush();await flush();
  const oldUI=c.assistance.entries.map(e=>e.ui),button=oldUI[0].children[0].children[1];
  button.click({preventDefault(){},stopPropagation(){}});const modal=c.assistance.modal;
  mutation(c);c.tick();assert.equal(c.assistance.modal,null);assert.equal(modal.isConnected,false);
  assert.equal(c.document.keydown,undefined);assert.ok(oldUI.every(n=>!n.isConnected));assert.equal(c.assistance.entries.length,0);
 }
 // A click racing ahead of the 500 ms watcher must not open stale route results.
 const racing=context();racing.requestAI=()=>Promise.resolve('ready');racing.startAssistance();await flush();await flush();
 const staleButton=racing.assistance.entries[0].ui.children[0].children[1];racing.location.href+='?new';
 staleButton.click({preventDefault(){},stopPropagation(){}});assert.equal(racing.assistance.modal,null);
 // Cancel/restart with pending old promises: old completions cannot publish into new run.
 const rerun=context(),oldPending=[];rerun.requestAI=()=>new Promise(resolve=>oldPending.push(resolve));rerun.startAssistance();await flush();
 rerun.requestAI=()=>Promise.resolve('new reply');rerun.startAssistance();await flush();await flush();
 oldPending.forEach(r=>r('old reply'));await flush();assert.ok(rerun.assistance.entries.every(e=>e.answer==='new reply'));
 // Preparation includes answered questions, whole multi-blank question, never their values.
 const fill=context();fill.groups=[{problem:Object.assign(node(),{text:'填空'}),inputs:[{value:'secret answer'},{value:''}]}];
 const data=fill.assistanceSnapshot(fill.groups[0],'fill');assert.equal(data.blankCount,2);assert.ok(!JSON.stringify(data).includes('secret answer'));
 // Image-disabled setting explicitly warns rather than fabricating an image answer.
 fill.requestAI=(m,t,h,s)=>{assert.match(m[1].content,/本次未发送图片/);return Promise.resolve('ok')};await fill.requestAssistance('fill',{description:'图',images:['https://example.test/a.png']},new AbortController().signal);
 assert.match(fill.assistancePrompt('programming',{}),/不要给出完整答案.*完整程序/);assert.match(fill.assistancePrompt('function',{}),/需要用到的语句/);assert.match(fill.assistancePrompt('fill',{}),/【答案】/);
 // Large questions never publish an obvious complete-code response.
 const large=context();large.assistanceGroups=()=>[large.groups[0]];
 large.detectType=()=> 'programming';large.extractProgramming=()=>({description:'编程题'});
 large.requestAI=()=>Promise.resolve('```java\npublic class Main {}\n```');
 large.startAssistance();await flush();await flush();assert.equal(large.assistance.entries[0].failed,true);
 assert.match(large.assistance.entries[0].answer,/结果已隐藏/);
 // Independent statement examples are now permitted, but full programs remain rejected above.
 const statements=context();statements.assistanceGroups=()=>[statements.groups[0]];
 statements.detectType=()=> 'programming';statements.extractProgramming=()=>({description:'编程题'});
 statements.requestAI=()=>Promise.resolve('【解题思路】拆分再转换\n【需要用到的语句】\n```java\nString[] parts = input.split("；");\n```\n```java\nint value = Integer.parseInt(price.trim());\n```');
 statements.startAssistance();await flush();await flush();assert.equal(statements.assistance.entries[0].failed,false);
 // Empty completions are failures, not successfully prepared explanations.
 const empty=context();empty.requestAI=()=>Promise.resolve('  ');empty.startAssistance();await flush();await flush();
 assert.ok(empty.assistance.entries.every(e=>e.failed));
 console.log('PASS: assistance mode, bounded requests, unchanged answers, delayed publication, config passthrough, stale/stop guards, plain-text rendering and failures');
})().catch(e=>{console.error(e);process.exitCode=1});

{
 const at=src.indexOf('    function assistanceViolatesLargeRule(');
 const end=src.indexOf('    function assistancePrompt(',at);
 const reject=vm.runInNewContext(src.slice(at,end)+'assistanceViolatesLargeRule');
 assert.equal(reject('int solve(int x) { return x; } // 中文注释'),true);
 assert.equal(reject('Use a loop and sum the prices.'),true);
 assert.equal(reject('【解题思路】按分号拆分每本书，再提取价格求和。\n【需要用到的方法】字符串分割和整数转换。'),false);
}
