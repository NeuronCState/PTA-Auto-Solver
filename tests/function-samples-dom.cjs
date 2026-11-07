// Real DOM extraction + actual cleaning + actual solve prompt. No model/API calls.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.env.PTA_DOM_MODULE || 'linkedom');
const src=fs.readFileSync(process.env.PTA_SAMPLE_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const slice=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const {document}=parseHTML('<html><body></body></html>');
const api=vm.runInNewContext(slice('    function queryAll(','    function nearestProblem(')+slice('    function getEditorDoc(','    function editorEmpty(')+slice('    function problemImages(','    function collectGroups(')+slice('    function promptFor(','    function baseUrl(')+'({extractFunction,extractProgramming,promptFor,questionText})',{document,state:{language:'c'},languageLabel:()=> 'C'});
function fixture(html){const p=document.createElement('section');p.innerHTML=html;document.body.replaceChildren(p);return p;}
function check(html,input,output){const p=fixture(html);for(const type of ['function','programming']){const q=type==='function'?api.extractFunction(p):api.extractProgramming(p);assert.equal(q.sampleInput,input);assert.equal(q.sampleOutput,output);const prompt=api.promptFor(type,{...q,description:q.fullText||q.desc},2);assert.ok(prompt.includes('【样例输入】\n'+input));assert.ok(prompt.includes('【样例输出】\n'+output));assert.ok(!q.sampleInput.includes('unrelated'));assert.ok(!q.sampleOutput.includes('unrelated'));}return p;}
const cm=(text,editable=false)=>`<div class="${editable?'answer':'readonly'}"><div class="cm-editor"><div class="cm-gutters">1\n2</div><div class="cm-content" contenteditable="${editable}"><div class="cm-line">${text}</div></div></div></div>`;
const lead='<p>计算价格，保留输出格式与 C++ 字符。</p><h3>函数接口定义:</h3>'+cm('int total();')+'<h3>裁判测试程序样例:</h3>'+cm('unrelated judge();');
check(lead+'<h3>输入样例:</h3><pre><code>  1\n\n\n2 \n</code></pre><h3>输出样例:</h3><pre> 3&#x20;\n</pre><h3>提示:</h3><pre>unrelated</pre>','  1\n\n\n2 \n',' 3 \n');
check(lead+'<h3>样 例 输 入 1：</h3><p>100<br>200</p><h3>样例 输出 1：</h3><p>10</p><h3>Sample Input 2:</h3><pre>2</pre><h3>Sample Output 2:</h3><pre>3</pre><h4>说明</h4>'+cm('unrelated'),'100\n200\n\n2','10\n\n3');
check(lead+'<p><strong>输入 样例：</strong></p><div class="pc-code"><span>1 </span><span> 2</span></div><p><strong>输出 样例：</strong></p><pre>输出：\n1\n2\n提示</pre><p>代码长度限制</p><p>unrelated 16 KB</p>','1  2','输出：\n1\n2\n提示');
check(lead+'<h3>输入样例:</h3>'+cm(' 5 ')+'<h3>输出样例:</h3>'+cm('6 ')+cm('unrelated answer',true),' 5 ','6 ');
const none=api.extractFunction(fixture('<p>无样例，两个普通代码块不是输入输出。</p>'+cm('unrelated 1')+cm('unrelated 2')));assert.equal(none.sampleInput,'');assert.equal(none.sampleOutput,'');
const only=api.extractFunction(fixture('<p>计算</p><h3>样例 输出:</h3>'+cm('42')));assert.equal(only.sampleOutput,'42');assert.equal(only.interfaceCode,'');assert.equal(only.supportCode,'');
console.log('PASS real DOM: function/programming prompt includes plain, spaced, multi-sample, exact whitespace; no pre/code duplication or unrelated/answer editor sample pollution');
