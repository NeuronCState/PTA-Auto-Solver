const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const core=vm.runInNewContext(section('    function textOf(','    function nearestProblem(')+section('    function getEditorDoc(','    function editorEmpty(')+'({textOf,cleanText,getEditorDoc})');
assert.equal(core.cleanText('输入格式: C++ 输出格式: 格式'), '输入格式: C++ 输出格式: 格式');
const sampleIn='Java程序设计：34 ；Web程序设计： 56；JSP程序设计：20';
for(const tail of [' ','&#x20;']){
 const sampleOut='Java程序设计：34'+tail+'\nWeb程序设计： 56\nJSP程序设计：20\n总价格为110';
 const makeEditor=doc=>({tagName:'DIV',classList:{contains:()=>true},querySelector:()=>({cmTile:{view:{state:{doc:{length:doc.length,sliceString:()=>doc}}}}})});
 const h=text=>({tagName:'H3',innerText:text});const nodes=[h('输入格式:'),h('输出格式:'),h('输入样例:'),makeEditor(sampleIn),h('输出样例:'),makeEditor(sampleOut)];
 const raw='图书价格汇总\n输入格式:\n中文；分隔、中文：标注价格。\n输出格式:\n打印图书及总价，遵循输出格式。\n输入样例:\n'+sampleIn+'\n输出样例:\n'+sampleOut;
 const problem={querySelectorAll:()=>nodes};
 const ctx={...core,problem,queryAll:selector=>selector==='.cm-editor'?nodes.filter(n=>n.querySelector):[],questionText:()=>core.cleanText(raw)};
 const result=vm.runInNewContext(section('    function problemCodeBlocks(','    function extractFunction(')+'extractProgramming(problem)',ctx);
 assert.equal(result.input,'中文；分隔、中文：标注价格。');assert.equal(result.output,'打印图书及总价，遵循输出格式。');assert.equal(result.sampleInput,sampleIn);assert.equal(result.sampleOutput,sampleOut);assert.ok(result.fullText.includes('输出格式'));
}
const literal=' C++ 格式\n\n\nline with trailing space \n';
assert.equal(core.getEditorDoc({querySelector:()=>({innerText:literal})}),literal);
console.log('PASS: real text cleaning retains headings, Chinese punctuation, sample spaces/newlines, literal entity and code');
