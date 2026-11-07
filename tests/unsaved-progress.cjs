const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.env.PTA_SCRIPT||'PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const start=source.indexOf('    function questionProgress()'),end=source.indexOf('    function setQuestionProgress',start);
function setup(initial=2,total=10,type=2){
 const state={saved:initial,total,type,set:1,page:'',missing:false,groups:[]};
 const url=()=>`https://pintia.cn/problem-sets/${state.set}/exam/problems/type/${state.type}${state.page}`;
 const names={1:'判断题',2:'单选题',3:'多选题',4:'填空题',5:'程序填空题',6:'函数题',7:'编程题'};
 const label=()=>`${names[state.type]} ${state.saved} / ${state.total}`;
 const context={location:{get href(){return url()},get pathname(){return url().replace(/^https:\/\/[^/]+/,'').split('?')[0]}},document:{body:{get text(){return state.missing?'':label()}},documentElement:{contains:p=>!p.detached}},textOf:e=>e.text||'',queryAll:()=>state.missing?[]:[{href:url(),text:label()}]};
 Object.assign(context,{collectGroups:()=>state.groups,groupFillInputs:()=>state.groups,groupProgramFills:()=>state.groups});
 const api=vm.runInNewContext(source.slice(start,end)+'({questionProgress,captureInitialProgress,markQuestionWritten,reconcileLocalProgress})',context);
 return {state,...api};
}
const problem=id=>({getAttribute:key=>key==='id'?id:null,text:''});
const choice=()=>[{type:'radio',checked:false},{type:'radio',checked:true}];
const blanks=(...values)=>values.map(value=>({type:'text',value}));
let a=setup();const token=a.captureInitialProgress();
assert.equal(a.questionProgress().current,2);
assert.equal(a.markQuestionWritten(problem('q1'),choice(),false,token),true);
assert.equal(a.questionProgress().current,3); // Sidebar still 2; unsaved work is visible.
assert.equal(a.markQuestionWritten(problem('q1'),choice(),false,token),false); // Re-render with same ID.
assert.equal(a.markQuestionWritten(problem('q2'),choice(),true,token),false); // Re-answer saved question.
assert.equal(a.markQuestionWritten(problem('q2'),[],false,token),false); // Failed/no-input job.
assert.equal(a.markQuestionWritten(problem('q2'),[{type:'radio',checked:false}],false,token),false);
const detached=problem('q3');detached.detached=true;
assert.equal(a.markQuestionWritten(detached,choice(),false,token),false);
assert.equal(a.markQuestionWritten(problem('q2'),choice(),false,token),true);
assert.equal(a.questionProgress().current,4);
a.captureInitialProgress();assert.equal(a.questionProgress().current,4); // Stop/restart is not a reload.
a.state.saved=4;assert.equal(a.reconcileLocalProgress().current,4); // Save catches up without +2 again.
assert.equal(a.markQuestionWritten(problem('q1'),choice(),false,token),false);
assert.equal(a.markQuestionWritten(problem('q3'),choice(),false,token),true);
assert.equal(a.questionProgress().current,5);
a.state.saved=7;assert.equal(a.reconcileLocalProgress().current,7); // Server/manual changes advance baseline.
a.markQuestionWritten(problem('q4'),choice(),false,token);assert.equal(a.questionProgress().current,8);
a.state.missing=true;assert.equal(a.questionProgress().current,8); // Loading gap doesn't invent or discard counts.
a.state.missing=false;
// Refresh has a fresh script instance and reads only the saved sidebar value.
const refreshed=setup(a.state.saved,a.state.total);assert.equal(refreshed.questionProgress().current,7);
const unsaved=setup(0,5);unsaved.captureInitialProgress();unsaved.markQuestionWritten(problem('q'),choice(),false);
assert.equal(unsaved.questionProgress().current,1);assert.equal(setup(0,5).questionProgress().current,0);
// Both fill types count a complete question, never the individual blanks.
for(const type of [4,5]){
 const f=setup(0,3,type),t=f.captureInitialProgress();
 assert.equal(f.markQuestionWritten(problem('fill1'),blanks('a',''),false,t),false);
 assert.equal(f.questionProgress().current,0);
 assert.equal(f.markQuestionWritten(problem('fill1'),blanks('a','b','c'),false,t),true);
 assert.equal(f.questionProgress().current,1);
 assert.equal(f.markQuestionWritten(problem('fill1'),blanks('a','b','c'),false,t),false);
 f.state.saved=1;assert.equal(f.reconcileLocalProgress().current,1);
}
// Type, exam and query page changes reset, and reject old async work tokens.
a.state.type=1;a.state.saved=0;assert.equal(a.questionProgress().current,0);
assert.equal(a.markQuestionWritten(problem('old'),choice(),false,token),false);
const newType=a.captureInitialProgress();a.markQuestionWritten(problem('new'),choice(),false,newType);assert.equal(a.questionProgress().current,1);
a.state.set=2;assert.equal(a.questionProgress().current,0);
const exam=a.captureInitialProgress();a.markQuestionWritten(problem('new'),choice(),false,exam);
a.state.page='?page=2';assert.equal(a.questionProgress().current,0);
assert.equal(a.markQuestionWritten(problem('stale'),choice(),false,exam),false);
// Changed list size resets same-URL baseline; the count is capped at the total.
a.state.total=1;const small=a.captureInitialProgress();a.markQuestionWritten(problem('s1'),choice(),false,small);a.markQuestionWritten(problem('s2'),choice(),false,small);assert.equal(a.questionProgress().current,1);
const noSummary=setup();noSummary.state.missing=true;assert.equal(noSummary.questionProgress(),null);assert.equal(noSummary.markQuestionWritten(problem('q'),choice(),false),false);
const program=setup(0,6,7);program.captureInitialProgress();assert.equal(program.markQuestionWritten(problem('q'),blanks('code'),false),false);
console.log('PASS: unsaved question count, dedup, save catch-up, restart/reload, navigation and multi-blank groups');

// Same URL/total SPA replacement resets; ordinary rerenders/reordering do not.
for(const type of [1,2,3,4,5]){
 const spa=setup(0,2,type);
 spa.state.groups=['a','b'].map(id=>({problem:problem(id)}));
 const old=spa.captureInitialProgress();
 spa.markQuestionWritten(problem('a'),type<=3?choice():blanks('x'),false,old);
 assert.equal(spa.questionProgress().current,1);
 spa.state.groups=['b','a'].map(id=>({problem:problem(id)}));
 assert.equal(spa.questionProgress().current,1); // New nodes, same stable ID set.
 spa.state.groups=[];assert.equal(spa.questionProgress().current,1); // Loading gap.
 spa.state.groups=[{problem:{text:'R1-1'}}];
 assert.equal(spa.questionProgress().current,1); // No stable IDs: preserve.
 spa.state.groups=['c','d'].map(id=>({problem:problem(id)}));
 assert.equal(spa.questionProgress().current,0);
 assert.equal(spa.markQuestionWritten(problem('c'),type<=3?choice():blanks('x'),false,old),false);
 const fresh=spa.captureInitialProgress();
 assert.equal(spa.markQuestionWritten(problem('c'),type<=3?choice():blanks('x'),false,fresh),true);
 assert.equal(spa.questionProgress().current,1);
}
// Numeric PTA wrapper IDs above extracted question nodes are stable too.
const wrapped=setup(0,1,4);
wrapped.state.groups=[{problem:{parentElement:problem('123456789')}}];
const wrapToken=wrapped.captureInitialProgress();
wrapped.markQuestionWritten(problem('123456789'),blanks('x'),false,wrapToken);
wrapped.state.groups=[{problem:{parentElement:problem('987654321')}}];
assert.equal(wrapped.questionProgress().current,0);
console.log('PASS: same-URL stable question-list replacement, rerenders and missing-ID fallback');
