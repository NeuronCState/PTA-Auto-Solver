const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    function typeRoute('),src.indexOf('    function questionProgress('));
const base='https://pintia.cn/problem-sets/demo/exam/problems/type/';
function fixture() {
 let clock=0,clicks=0;
 const location={href:base+'2'};
 const old={text:'old'},fresh={text:'new'};let nodes=[old];
 const state={running:true,runId:9,pageErrors:0};let continuous=true;
 const link=(id,text,href=base+id)=>({href,text,getAttribute:n=>n==='href'?href:null,click(){clicks++;location.href=href;nodes=[fresh];}});
 // Same structure and counts as the sanitized user snapshot: type1 complete,
 // type2 0/41, type4 0/5, type6 0/1, type7 0/6.
 const links=[link(1,'判断题 5 / 5'),link(2,'单选题 0 / 41'),link(2,'R2-1'),link(3,'多选题 0 / 0'),link(4,'填空题 0 / 5'),link(6,'函数题 0 / 1'),link(7,'编程题 0 / 6')];
 const ctx={URL,location,state,QUESTION_TYPES:{1:'judge',2:'choice',3:'multi_choice',4:'fill',5:'program_fill',6:'function',7:'programming'},queryAll:s=>s==='a[href]'?links:nodes,textOf:n=>n.text,collectGroups:()=>nodes.map(problem=>({problem})),groupFillInputs:()=>nodes.map(problem=>({problem})),groupProgramFills:()=>nodes.map(problem=>({problem})),detectType:()=> 'choice',isContinuous:()=>continuous,Date:{now:()=>clock},sleep:async ms=>{clock+=ms;},log(){}};
 const api=vm.runInNewContext(code+'({nextTypeLink,goNextType})',ctx);
 return {api,links,link,location,state,get clicks(){return clicks;},set continuous(v){continuous=v;},freeze(){nodes=[old];links[4].click=()=>{clicks++;location.href=base+'4';};},stop(){ctx.sleep=async()=>{state.running=false;};}};
}
(async()=>{
 let f=fixture();assert.equal(f.api.nextTypeLink({}).route.id,'4');
 assert.equal(f.api.nextTypeLink({'4':true}).route.id,'6');
 f.links[4].text='填空题 5 / 5';assert.equal(f.api.nextTypeLink({}).route.id,'6');
 f.links.unshift(f.link(4,'填空题 0 / 5','https://evil.example/problem-sets/demo/exam/problems/type/4'));
 assert.equal(f.api.nextTypeLink({}).route.id,'6');
 f.location.href=base+'7';assert.equal(f.api.nextTypeLink({}),null); // no wrap
 f=fixture();const visited={2:true};assert.equal(await f.api.goNextType(visited,9),true);assert.equal(f.clicks,1);assert.equal(visited[4],true);
 for(const mode of ['stopped','single','stale','error']) {f=fixture();if(mode==='stopped')f.state.running=false;if(mode==='single')f.continuous=false;if(mode==='stale')f.state.runId=10;if(mode==='error')f.state.pageErrors=1;assert.equal(await f.api.goNextType({},9),false);assert.equal(f.clicks,0);}
 f=fixture();f.freeze();assert.equal(await f.api.goNextType({},9),false);assert.equal(f.clicks,1); // route changed, stale DOM
 f=fixture();f.stop();assert.equal(await f.api.goNextType({},9),false);
 console.log('PASS: type-summary routing, count/visited filtering, no wrap, stop/error guards, SPA readiness');
})().catch(e=>{console.error(e);process.exitCode=1;});
