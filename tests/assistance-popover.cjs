const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
function section(a,b){return src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));}
function node(name){return {name,children:[],attrs:{},appendChild(n){this.children.push(n);return n},setAttribute(k,v){this.attrs[k]=v}};}
const ctx={document:{body:node('body'),createElement:node},assistanceNormalizeText:String,assistanceIsLarge:t=>t==='programming'||t==='function',renderAssistance:text=>({text}),textOf:n=>n.text};vm.createContext(ctx);
vm.runInContext(section('    function assistanceChoiceOptions(','    function openAssistanceModal(')+section('    function assistanceHeaderRow(','    function mountAssistance('),ctx);
let result=ctx.assistanceSections({type:'choice',answer:'【答案】B\n【解析】理由',data:{options:[{label:'B',text:'T'}]}});assert.equal(result.children[0].children[0].textContent,'答案');assert.equal(result.children[1].children[0].textContent,'解析');assert.equal(result.children[0].children[1].children[0].children[0].textContent,'B：');
result=ctx.assistanceSections({type:'programming',answer:'### 解题思路\n比较增长率\n### 需要用到的方法\n极限'});assert.equal(result.children[0].children[0].textContent,'解题思路');assert.equal(result.children[1].children[1].text,'极限');assert.equal(result.children[1].children[0].textContent,'需要用到的语句');
result=ctx.assistanceSections({type:'function',answer:'【解题思路】逐步处理\n【需要用到的语句】`split` 和 `trim`'});assert.equal(result.children[1].children[0].textContent,'需要用到的语句');
for(const text of ['猜测为B','【答案】B','【解析】理由\n【答案】B','前言\n【答案】B\n【解析】理由']){result=ctx.assistanceSections({type:'choice',answer:text});assert.equal(result.children[0].children[0].textContent,'模型原文（未按规范分段）');assert.equal(result.children[0].children[1].text,text);}
for(const rect of [{top:0,bottom:20,right:10},{top:700,bottom:730,right:1100},{top:100,bottom:130,right:400}]){const p=ctx.assistancePopoverPosition(rect,440,560,1000,750);assert.ok(p.left>=12&&p.left+p.width<=988);assert.ok(p.top>=12&&p.top+560<=738);}
const small=ctx.assistancePopoverPosition({top:200,bottom:230,right:300},440,560,320,400);assert.equal(small.width,296);assert.equal(small.maxHeight,376);
function container(titles=[],hasMarkdown=false){return {querySelectorAll:()=>titles,querySelector:()=>hasMarkdown?{}:null,matches:()=>false};}
const row={classList:{contains:n=>n==='flex'},querySelector:()=>null};const title={text:'R2-1',parentElement:row,closest:()=>null};const header=container([title]);
const body=ctx.document.body,outer={parentElement:body},problem=Object.assign(container(),{parentElement:outer,previousElementSibling:header});assert.equal(ctx.assistanceHeaderRow(problem),row);
// Missing/ambiguous title or a previous whole question safely declines placement.
header.querySelectorAll=()=>[];assert.equal(ctx.assistanceHeaderRow(problem),null);header.querySelectorAll=()=>[title,title];assert.equal(ctx.assistanceHeaderRow(problem),null);header.querySelectorAll=()=>[title];header.querySelector=()=>({});assert.equal(ctx.assistanceHeaderRow(problem),null);
assert.match(src,/prefers-reduced-motion:reduce/);assert.match(src,/pta-assist-rendered strong/);assert.match(src,/document\.addEventListener\('pointerdown', outside, true\)/);
console.log('PASS anchored popover bounds, explicit section normalization, raw fallback, title-row association and safe missing-title fallback');
