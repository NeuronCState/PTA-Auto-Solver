const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.env.PTA_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js', 'utf8');
function section(start, end) { const at = source.indexOf(start); assert(at >= 0); return source.slice(at, source.indexOf(end, at)); }
let stored = null;
const elements = Object.fromEntries(['pta-concurrent-enabled', 'pta-concurrency', 'pta-concurrency-val'].map(id => [id, {listeners:{}, addEventListener(event, fn) { this.listeners[event] = fn; }}]));
const context = vm.createContext({PROVIDERS:{opencode:{baseUrl:''}}, STORAGE_KEY:'test', localStorage:{getItem:()=>stored,setItem:(_,v)=>{stored=v;}}, document:{getElementById:id=>elements[id] || null}, flashSaveStatus:()=>{}});
vm.runInContext(section('    var state = {', '    var THINKING_LABELS = {') + section('    function syncConcurrencyUI()', '    function syncUI()') + 'loadState();syncConcurrencyUI();', context);
assert.equal(context.state.concurrentEnabled,false);
assert.equal(context.state.concurrency,3);
assert.equal(elements['pta-concurrency'].disabled,true);
for (const [input, expected] of [[undefined,3],[null,3],['',3],['bad',3],[Infinity,3],[-1,1],[0,1],[1,1],[2.6,3],['9',9],[10,10],[99,10]]) assert.equal(context.normalizeConcurrency(input),expected);
// Legacy configuration remains sequential; malformed persisted settings normalize.
stored = JSON.stringify({continuous:false}); context.loadState(); assert.equal(context.state.concurrentEnabled,false); assert.equal(context.state.concurrency,3);
stored = JSON.stringify({concurrentEnabled:'true',concurrency:42}); context.loadState(); assert.equal(context.state.concurrentEnabled,false); assert.equal(context.state.concurrency,10);
stored = JSON.stringify({concurrentEnabled:true,concurrency:7}); context.loadState(); context.syncConcurrencyUI(); assert.equal(elements['pta-concurrent-enabled'].checked,true);assert.equal(elements['pta-concurrency'].value,'7');assert.equal(elements['pta-concurrency-val'].textContent,'7');assert.equal(elements['pta-concurrency'].disabled,false);
vm.runInContext(section("        var concurrentToggle = document.getElementById('pta-concurrent-enabled');", "        var maxTokensEl = document.getElementById('pta-max-tokens');"), context);
for (const event of ['input','change']) {
    elements['pta-concurrency'].value='9'; elements['pta-concurrency'].listeners[event]();
    assert.equal(JSON.parse(stored).concurrency,9); assert.equal(elements['pta-concurrency-val'].textContent,'9');
    elements['pta-concurrent-enabled'].checked=false; elements['pta-concurrent-enabled'].listeners[event]();
    assert.equal(JSON.parse(stored).concurrentEnabled,false);assert.equal(elements['pta-concurrency'].disabled,true);
    elements['pta-concurrent-enabled'].checked=true; elements['pta-concurrent-enabled'].listeners[event]();
    assert.equal(elements['pta-concurrency'].disabled,false);assert.equal(context.state.concurrency,9);
}
// Save/reload round trip and navigation synchronization preserve the value.
context.state.concurrency=12;context.saveState();context.loadState();context.syncConcurrencyUI();assert.equal(context.state.concurrency,10);assert.equal(elements['pta-concurrency'].value,'10');
assert(source.indexOf('id="pta-concurrent-enabled"') < source.indexOf('id="pta-max-tokens"'));
assert.match(source,/id="pta-concurrency"[^>]+min="1" max="10" step="1"/);
assert.match(section('    function syncUI()', '    function bindUI('), /syncConcurrencyUI\(\)/);
assert.match(section('    function saveSettings(', '    function loadModels('), /state\.concurrency = normalizeConcurrency\(concurrencySlider\.value\)/);
console.log('Concurrency UI/config checks passed (mock DOM; no browser/API calls).');
