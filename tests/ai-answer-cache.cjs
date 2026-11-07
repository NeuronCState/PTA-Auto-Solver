const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
let now=1000;
const ctx={Map,Date:{now:()=>now},state:{provider:'mimo',language:'java',configs:{mimo:{model:'m',apiKey:'PRIVATE',thinking:2,maxTokens:2048}}},location:{origin:'https://pintia.cn',pathname:'/problem-sets/1/exam/problems/type/2',hash:''},endpoint:()=>'/api/v1',Promise};
vm.createContext(ctx);vm.runInContext(section('    // Private, bounded local userscript cache.', '    function solveOne('),ctx);
vm.runInContext("aiCacheOwner='123'",ctx);
vm.runInContext(section('    function assistanceIsLarge(', '    function assistancePrompt(')+section('    function aiAssistanceCacheable(', '    function requestAssistance(')+section('    function assistanceChoiceOptions(', '    function renderAssistanceChoice('),ctx);
const choiceData={options:[{label:'A',text:'yes'},{label:'B',text:'no'}]};
assert.equal(ctx.aiAssistanceCacheable('choice',choiceData,'【答案】A：yes\n【解析】because'),true);
assert.equal(ctx.aiAssistanceCacheable('choice',choiceData,'【答案】A：no\n【解析】because'),false);
assert.equal(ctx.aiAssistanceCacheable('choice',choiceData,'【答案】C\n【解析】because'),false);
assert.equal(ctx.aiAssistanceCacheable('choice',choiceData,'network error'),false);
assert.equal(ctx.aiAssistanceCacheable('programming',{},'【解题思路】按顺序分析\n【需要用到的语句】使用变量声明'),true);
assert.equal(ctx.aiAssistanceCacheable('programming',{},'【解题思路】中文\n【需要用到的语句】public class Main {}'),false);
const key=(mode='answer',data={description:'q',options:[{label:'A',text:'yes',input:{nodeType:1}}]},id='q1')=>ctx.aiCacheKey(mode,'choice',data,{id},0);
let k=key();assert.ok(!k.includes('PRIVATE'));assert.ok(!k.includes('nodeType'));
ctx.aiCacheWrite(k,'A',0);assert.equal(ctx.aiCacheRead(k,false),'A');assert.equal(ctx.aiCacheRead(k,true),null);
assert.equal(ctx.aiCacheRead(key('assistance'),false),null);assert.notEqual(key('answer',{description:'changed'}),k);assert.notEqual(key('answer',undefined,'q2'),k);
for(const [field,value] of [['model','m2'],['thinking',3],['maxTokens',4096],['images',true]]){const old=ctx.state.configs.mimo[field];ctx.state.configs.mimo[field]=value;assert.notEqual(key(),k);ctx.state.configs.mimo[field]=old;}
ctx.location.pathname='/problem-sets/2/exam/problems/type/2';assert.notEqual(key(),k);ctx.location.pathname='/problem-sets/1/exam/problems/type/2';
ctx.state.language='c';assert.notEqual(key(),k);ctx.state.language='java';
now+=7*24*60*60*1000+1;assert.equal(ctx.aiCacheRead(k,false),null);
ctx.aiCacheWrite(k,'',0);assert.equal(ctx.aiCacheRead(k,false),null);
for(let i=0;i<250;i++)ctx.aiCacheWrite('key'+i,'answer',0);
assert.equal(vm.runInContext('aiAnswerCache.size',ctx),200);assert.equal(ctx.aiCacheRead('key0',false),null);
ctx.aiCacheWrite('oversized','x'.repeat(128*1024),0);assert.equal(ctx.aiCacheRead('oversized',false),null);
ctx.clearAIAnswerCache();ctx.aiCacheWrite(k,'late answer',0);assert.equal(ctx.aiCacheRead(k,false),null);
for(let i=0;i<100;i++)ctx.aiCacheWrite('big'+i,'x'.repeat(60000),1);
assert.ok(vm.runInContext('aiCacheBytes <= 2*1024*1024 && aiAnswerCache.size < 100',ctx));
ctx.clearAIAnswerCache();
// Real concurrentJob code: successful application caches, invalid data doesn't;
// cache read still passes through original input/DOM identity guards.
let calls=0,description='q';const input={value:'',checked:false,disabled:false,readOnly:false,attached:true};
const problem={id:'q',attached:true,contains:n=>n===input};const group={problem,inputs:[input]};
Object.assign(ctx,{prepareAIAnswerCache:async()=>{},activeSolveController:null,document:{documentElement:{contains:n=>n.attached}},questionText:()=>description,extractOptions:()=>null,problemImages:()=>[],resolveLanguage:()=> 'java',getEditorDoc:()=>'',normalizeAnswer:x=>x,writeInput:(i,v)=>{i.value=v;return true},solveOne:async()=>{calls++;return 'answer'},isSkipAnswered:()=>false});
vm.runInContext(section('    function concurrentJob(', '    function runConcurrentJobs'),ctx);
(async()=>{
 let job=ctx.concurrentJob(group,'fill',0),answer=await job.request();assert.equal(calls,1);assert.equal(job.apply('bad|format'),0);
 let other=ctx.concurrentJob(group,'fill',0);await other.request();assert.equal(calls,2); // Not cached before validation
 assert.equal(job.apply(answer),1);job.cacheAccepted(answer);input.value='';
 job=ctx.concurrentJob(group,'fill',0);assert.equal(await job.request(),'answer');assert.equal(calls,2);
 input.value='manual edit';assert.equal(job.valid(),false);input.value='';
 vm.runInContext('aiCacheBypassRun=true',ctx);job=ctx.concurrentJob(group,'fill',0);await job.request();assert.equal(calls,3);
 vm.runInContext('aiCacheBypassRun=false',ctx);description='changed';job=ctx.concurrentJob(group,'fill',0);await job.request();assert.equal(calls,4);
 // Wire policy and validation hooks, not a lower-level requestAI cache.
 assert.match(src,/aiCacheBypassRun = isSkipAnswered\(\)/);
 assert.match(src,/if \(fullScore\) \{\s*aiCacheWrite/);
 assert.match(src,/aiCacheRead\(codeCacheKey, aiCacheBypassRun \|\| attempts > 0\)/);
 assert.match(src,/if \(!item\.apply\(answer\)\)[\s\S]+if \(item\.cacheAccepted\)/);
 assert.match(src,/if \(aiAssistanceCacheable\(entry.type, entry.data, answer\)\) aiCacheWrite/);
 console.log('PASS: exact isolated keys, settings/mode/problem invalidation, bypass, TTL/LRU/bytes, no credentials, clear generation, write-validation gate, edit guards');
})().catch(e=>{console.error(e);process.exitCode=1});
