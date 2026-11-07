const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
function section(a,b){const i=source.indexOf(a);assert(i>=0);return source.slice(i,source.indexOf(b,i));}
let stored=null;
const elements=Object.fromEntries(['pta-concurrency','pta-concurrency-val'].map(id=>[id,{listeners:{},addEventListener(e,fn){this.listeners[e]=fn;}}]));
const context=vm.createContext({PROVIDERS:{opencode:{baseUrl:''}},STORAGE_KEY:'test',localStorage:{getItem:()=>stored,setItem:(_,v)=>{stored=v}},document:{getElementById:id=>elements[id]||null},flashSaveStatus(){}});
vm.runInContext(section('    var state = {','    var THINKING_LABELS = {')+section('    function syncConcurrencyUI()','    function syncUI()')+'loadState();syncConcurrencyUI();',context);
assert.equal(context.state.concurrency,1);assert.equal(elements['pta-concurrency'].disabled,false);assert.equal(elements['pta-concurrency-val'].textContent,'1（串行）');
for(const [input,expected] of [[undefined,1],[null,1],['',1],['bad',1],[Infinity,1],[-1,1],[0,1],[1,1],[2.6,3],['9',9],[99,10]])assert.equal(context.normalizeConcurrency(input),expected);
for(const [saved,expected] of [[{},1],[{concurrentEnabled:false,concurrency:8},1],[{concurrentEnabled:'true',concurrency:8},1],[{concurrentEnabled:true,concurrency:7},7],[{concurrency:6},6]]){
 stored=JSON.stringify(saved);context.loadState();assert.equal(context.state.concurrency,expected);context.saveState();assert.equal(Object.hasOwn(JSON.parse(stored),'concurrentEnabled'),false);context.loadState();assert.equal(context.state.concurrency,expected);
}
vm.runInContext(section("        var concurrencySlider = document.getElementById('pta-concurrency');","        var maxTokensEl = document.getElementById('pta-max-tokens');"),context);
for(const event of ['input','change'])for(const value of [1,2,10]){
 elements['pta-concurrency'].value=String(value);elements['pta-concurrency'].listeners[event]();assert.equal(JSON.parse(stored).concurrency,value);assert.equal(elements['pta-concurrency'].disabled,false);assert.equal(elements['pta-concurrency-val'].textContent,value===1?'1（串行）':String(value));
}
assert(!source.includes('pta-concurrent-enabled'));assert(source.indexOf('id="pta-concurrency"')<source.indexOf('id="pta-max-tokens"'));
assert.match(source,/id="pta-concurrency"[^>]+min="1" max="10" step="1"/);
assert.match(section('    function runConcurrentJobs(','    async function solveSmallQuestionPage'),/var limit = normalizeConcurrency\(state.concurrency\)/);
console.log('PASS: slider-only controls, 1=serial, 2-10 parallel, safe legacy migration and persistence');
