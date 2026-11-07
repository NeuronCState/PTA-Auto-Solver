const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js', 'utf8');
const section = (a,b) => src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const tick = () => new Promise(r => setImmediate(r));
function harness(limit = 1) {
    const state = { concurrency: limit }, env = { current: true, scrolls: [], writes: [], resolvers: [] };
    const ctx = {prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){}, state, normalizeConcurrency: x => x, isContinuous: () => true, questionCommitQueue: Promise.resolve(), canWriteQuestions: () => true, rememberPageWrite(){}, markQuestionWritten(){}, log(){}, setQuestionProgress(){} };
    env.run = vm.runInNewContext(section('    function runConcurrentJobs(', '    async function solveSmallQuestionPage') + 'runConcurrentJobs', ctx);
    env.jobs = [0,1,2].map(id => ({ label: String(id), valid: () => true, reveal: () => env.scrolls.push(id), request: () => new Promise(resolve => { env.resolvers[id] = resolve; }), apply: () => { env.writes.push(id); return 1; } }));
    return env;
}
(async () => {
    let h = harness(), p = h.run(h.jobs, () => h.current); await tick(); assert.deepEqual(h.scrolls, [0]);
    h.resolvers[0]('A'); await tick(); assert.deepEqual(h.scrolls, [0,1]);
    h.resolvers[1]('A'); await tick(); h.resolvers[2]('A'); await p; assert.deepEqual(h.scrolls, [0,1,2]);
    h = harness(3); p = h.run(h.jobs, () => h.current); await tick(); assert.deepEqual(h.scrolls, []);
    h.resolvers[1]('A'); await tick(); h.resolvers[0]('A'); await tick(); h.resolvers[2]('A'); await p;
    assert.deepEqual(h.scrolls, [1,2]); assert.deepEqual(h.writes, [1,0,2]);
    h = harness(3); p = h.run(h.jobs, () => h.current); await tick(); h.current = false; h.resolvers.forEach(r => r('A')); await p; assert.deepEqual(h.scrolls, []);
    h = harness(3); h.jobs[0].valid = () => false; h.jobs[1].apply = () => 0; p = h.run(h.jobs, () => h.current); await tick(); h.resolvers.filter(Boolean).forEach(r => r('A')); await p; assert.deepEqual(h.scrolls, []);
    h = harness(); h.jobs[0].reveal = () => { throw Error('unavailable'); }; p = h.run([h.jobs[0]], () => h.current); await tick(); h.resolvers[0]('A'); assert.equal((await p).written, 1);
    // Exercise the real per-question reveal against attached/detached nodes.
    let attached = true, calls = [];
    const input = { value: '' }, group = { problem: { scrollIntoView: options => calls.push(options) }, inputs: [input] };
    const ctx = {prepareAIAnswerCache:async()=>{},activeSolveController:null,aiCacheGeneration:0,aiCacheBypassRun:false,aiCacheKey:()=>"unit",aiCacheRead:()=>null,aiCacheWrite(){}, document: { documentElement: { contains: () => attached } }, questionText: () => 'question', isSkipAnswered: () => false, problemImages: () => [], resolveLanguage: () => 'java', state: { language: 'auto' } };
    const make = vm.runInNewContext(section('    function concurrentJob(', '    var pendingPageWrites =') + 'concurrentJob', ctx);
    let job = make(group, 'fill', 0); job.reveal(); assert.equal(calls.length, 1); assert.equal(calls[0].block, 'center');
    attached = false; job.reveal(); assert.equal(calls.length, 1);
    console.log('PASS: serial scrolling, forward-only concurrent scrolling, stopped/failed/detached guards, cosmetic failures');
})().catch(e => { console.error(e); process.exitCode = 1; });
