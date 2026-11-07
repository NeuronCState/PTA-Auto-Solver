const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    function compilerLanguage('),src.indexOf('    async function submitCode('))+'({ensureCompilerLanguage,requiredCompilerLanguage,compilerLanguage,compilerStillMatches})';
function setup({selected='C (gcc)',target='Java (javac)',manual='auto',course='JAVA程序设计',sourceCode='old C answer',targetCode='',options=['Java (javac)'],noMenu=false,changeWhileOpening=false}={}){
 let clock=0,open=false,switched=false,clicks=0,escapes=0;
 const scope={};const content={getAttribute:()=> 'true'};
 const ed=doc=>({doc,closest:()=>scope,getClientRects:()=>[{}],querySelector:()=>content,parentElement:{className:'codeEditor'}});
 const original=ed(sourceCode),replacement=ed(targetCode),backupButton={};
 const menu={getClientRects:()=>open?[{}]:[]};
 const input={disabled:false,focus(){},getAttribute:k=>k==='aria-controls'?'menu-id':null,dispatchEvent:e=>{if(e.key==='ArrowDown')open=!noMenu;if(e.key==='Escape'){open=false;escapes++}}};
 const control={getClientRects:()=>[{}],closest:()=>null,getAttribute:()=>null,querySelector:s=>s==='.select__single-value'?{text:selected}:input,parentElement:{}};
 const opts=options.map(text=>({text,getClientRects:()=>[{}],getAttribute:()=>null,classList:{contains:()=>false},click(){selected=text;switched=true;clicks++;open=false;}}));
 const ctx={state:{language:manual},location:{href:'https://pintia.cn/test'},document:{title:'PTA',getElementById:id=>id==='menu-id'?(open?menu:null):backupButton,documentElement:{contains:n=>n===scope||n===(switched?replacement:original)}},textOf:n=>n.text||'',queryAll:(selector,root)=>selector.startsWith('a[href')?[{text:course}]:selector==='.select__control'?[control]:selector==='[role="option"], .select__option'?opts:selector==='.cm-editor'?[switched?replacement:original]:[],getEditorDoc:editor=>editor.doc,KeyboardEvent:class{constructor(_,fields){Object.assign(this,fields)}},Date:{now:()=>clock},sleep:async ms=>{clock+=ms;if(changeWhileOpening)original.doc='user edit';},log(){},writeEditor(){throw Error('must never overwrite target draft during switching')}};
 const api=vm.runInNewContext(code,ctx);return {api,ctx,original,replacement,backupButton,get clicks(){return clicks},get escapes(){return escapes}};
}
(async()=>{
 let h=setup();let r=await h.api.ensureCompilerLanguage(h.original,{},()=>true);assert.equal(r.language,'java');assert.equal(r.editor,h.replacement);assert.equal(h.clicks,1);assert.equal(h.ctx.compilerBackup.code,'old C answer');assert.equal(h.backupButton.hidden,false);
 h=setup({targetCode:'saved Java draft'});await h.api.ensureCompilerLanguage(h.original,{},()=>true);assert.equal(h.replacement.doc,'saved Java draft');assert.equal(h.ctx.compilerBackup.targetCode,'saved Java draft');
 h=setup({selected:'Java (javac)'});r=await h.api.ensureCompilerLanguage(h.original,{},()=>true);assert.equal(r.editor,h.original);assert.equal(h.clicks,0);
 h=setup({manual:'c'});r=await h.api.ensureCompilerLanguage(h.original,{},()=>true);assert.equal(r.language,'c');assert.equal(h.clicks,0);
 h=setup({options:['C++ (g++)']});await assert.rejects(h.api.ensureCompilerLanguage(h.original,{},()=>true),/未提供/);assert.equal(h.clicks,0);assert.equal(h.escapes,1);
 h=setup({options:['Java 8','Java 17']});await assert.rejects(h.api.ensureCompilerLanguage(h.original,{},()=>true),/多个匹配/);assert.equal(h.clicks,0);
 h=setup({course:'算法练习'});await assert.rejects(h.api.ensureCompilerLanguage(h.original,{},()=>true),/无法可靠确定/);assert.equal(h.clicks,0);
 h=setup({noMenu:true});await assert.rejects(h.api.ensureCompilerLanguage(h.original,{},()=>true),/无法读取/);assert.equal(h.clicks,0);
 h=setup();await assert.rejects(h.api.ensureCompilerLanguage(h.original,{},()=>false),/停止/);assert.equal(h.clicks,0);
 for(const [label,language]of [['C (gcc)','c'],['C++17 (g++)','cpp'],['Java (javac)','java'],['JavaScript',''],['Python 3','python'],['Pascal','pascal']])assert.equal(h.api.compilerLanguage(label),language);
 assert.ok(!src.slice(src.indexOf('    async function solveSmallQuestionPage('),src.indexOf('    // Small-question pages use')).includes('ensureCompilerLanguage'));
 console.log('PASS: scoped compiler selection, manual/course precedence, ambiguous/missing options, target drafts, backups and stop guards');
})().catch(e=>{console.error(e);process.exitCode=1});
