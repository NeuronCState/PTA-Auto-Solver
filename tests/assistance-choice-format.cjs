const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
function node(name){return {name,children:[],appendChild(n){this.children.push(n);return n}};}
const ctx={document:{createElement:node}};vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('    function assistanceChoiceOptions('),src.indexOf('    function assistanceSections(')),ctx);
const data={options:[{label:'A',text:'A. T'},{label:'B',text:'B：F'}]};
function mapped(raw,type='judge',d=data){return ctx.assistanceChoiceAnswer(raw,d,type);}
assert.equal(mapped('A').options[0].text,'T');assert.equal(mapped('A：T').options[0].text,'T');assert.equal(mapped('T').options[0].label,'A');assert.equal(mapped('F').options[0].label,'B');
assert.equal(mapped('**A**').options[0].label,'A');assert.equal(mapped('选项：A').options[0].label,'A');
assert.deepEqual(Array.from(mapped('AB','multi_choice').options,o=>o.label),['A','B']);assert.equal(mapped('A：T\nB：F','multi_choice').options.length,2);
for(const raw of ['AB','Z','A或B','可能是A','不知道','T/F','A：T\nZ：未知','A：不确定','A：maybe T','A：?' ])assert.equal(mapped(raw),null,raw);
assert.equal(mapped('T','judge',{options:[{label:'A',text:'T'},{label:'B',text:'T'}]}),null);
assert.equal(mapped('A','choice',{options:[{label:'A',text:'x'},{label:'A',text:'y'}]}),null);
assert.match(mapped('A：F').warning,/不一致/);assert.equal(mapped('A：F').options[0].text,'T');
assert.equal(mapped('x','fill'),null);assert.equal(mapped('x','programming'),null);
const hostile={options:[{label:'A',text:'<img src=x onerror=alert(1)> \\(\\href{javascript:bad()}{x}\\) **fake**'}]};
const answer=mapped('A','choice',hostile),rendered=ctx.renderAssistanceChoice(answer);
assert.equal(rendered.children[0].children[1].textContent,hostile.options[0].text);assert.equal(rendered.children[0].children[1].name,'span');assert.equal(rendered.children[0].children[0].textContent,'A：');
assert.equal(mapped('A：<script>bad()</script>','choice',hostile).options[0].text,hostile.options[0].text);
const legacy={options:[{label:'T',text:'T'},{label:'F',text:'F'}]};assert.equal(mapped('T','judge',legacy).options[0].label,'A');
console.log('PASS canonical option letter/content, judge and multi-select, exact mapping, ambiguity refusal, mismatch warning and inert HTML/math content');
