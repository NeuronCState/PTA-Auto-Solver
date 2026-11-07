const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(process.env.PTA_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=src.slice(src.indexOf('    function catalogueRoute('),src.indexOf('    function render()'));
function harness(mode='ok') {
 let now=0,queue=[],active=0,max=0,starts=[],frames=[],events={},intervals=[];
 const ctx={window:{addEventListener:(name,fn)=>events[name]=fn},setInterval:fn=>{intervals.push(fn);return 1;},URL,Map,Set,Date:class extends Date{static now(){return now;}},location:{origin:'https://pintia.cn',pathname:'/problem-sets/dashboard'},setTimeout:(fn,ms)=>queue.push({at:now+ms,fn}),document:{getElementById:()=>null,querySelector:()=>null,createElement(){
  const f={style:{},setAttribute(){},remove(){if(this.live){this.live=false;active--;}}};
  Object.defineProperty(f,'contentWindow',{get(){if(mode==='cross-origin')throw new Error('SecurityError');return {location:{href:mode==='login'?'https://pintia.cn/login':f.src}};}});
  Object.defineProperty(f,'contentDocument',{get(){const u=new URL(f.src);return {location:mode==='login'?{href:'https://pintia.cn/login',origin:u.origin,pathname:'/login'}:{href:f.src,origin:u.origin,pathname:u.pathname}};}});frames.push(f);return f;
 },body:{appendChild(f){f.live=true;active++;max=Math.max(max,active);starts.push(now);}}}};
 const api=vm.runInNewContext(section+`;catalogueOverview=function(){return ${mode==='timeout'?'null':"{score:'0',progress:'0%',answered:0,total:1}"}};({loadCatalogueOverviews,readCatalogueOverview,stopClassCatalogue,startClassHome,catalogueState,catalogueMetricFrames})`,ctx);
 async function flush(p){let done=false,error;p.then(()=>done=true,e=>{done=true;error=e;});for(let i=0;!done&&i<100000;i++){await Promise.resolve();await Promise.resolve();if(queue.length){queue.sort((a,b)=>a.at-b.at);const t=queue.shift();now=t.at;t.fn();}}assert.ok(done,'scheduled operation settled');if(error)throw error;}
 return {api,ctx,flush,starts,frames,events,intervals,max:()=>max,active:()=>active,time:()=>now};
}
(async()=>{
 let h=harness();h.api.catalogueState.rows=Array.from({length:205},(_,i)=>({id:String(i)}));await h.flush(h.api.loadCatalogueOverviews(0));
 assert.equal(h.starts.length,200);assert.ok(h.max()<=2);assert.equal(h.active(),0);assert.equal(h.api.catalogueState.rows.filter(r=>r.metricsState==='ready').length,200);assert.equal(h.api.catalogueState.rows[204].metricsState,'unavailable');
 for(let i=1;i<h.starts.length;i++)assert.ok(h.starts[i]-h.starts[i-1]>=500,'global start spacing');
 h=harness('login');h.api.catalogueState.rows=Array.from({length:30},(_,i)=>({id:String(i)}));await h.flush(h.api.loadCatalogueOverviews(0));assert.equal(h.starts.length,1);assert.equal(h.api.catalogueState.metricsBlocked,true);assert.equal(h.active(),0);
 h=harness('cross-origin');h.api.catalogueState.rows=[{id:'1'},{id:'2'}];await h.flush(h.api.loadCatalogueOverviews(0));assert.equal(h.starts.length,1);assert.equal(h.api.catalogueState.metricsBlocked,true);assert.equal(h.active(),0);
 h=harness('timeout');h.api.catalogueState.rows=Array.from({length:200},(_,i)=>({id:String(i)}));await h.flush(h.api.loadCatalogueOverviews(0));assert.ok(h.starts.length<200);assert.ok(h.starts.every(t=>t<180000));assert.ok(h.time()<=180250);assert.equal(h.active(),0);
 h=harness();const old={id:'1'};h.api.catalogueState.rows=[old,{id:'2'}];const pending=h.api.loadCatalogueOverviews(0);h.ctx.location.pathname='/problem-sets/1/exam';h.api.stopClassCatalogue();h.api.catalogueState.rows=[{id:'new'}];await h.flush(pending);assert.equal(old.metrics,undefined);assert.equal(h.api.catalogueState.rows[0].id,'new');assert.equal(h.api.catalogueState.rows[0].metricsState,undefined);assert.equal(h.active(),0);assert.equal(h.api.catalogueMetricFrames.size,0);
 h=harness();h.ctx.location.pathname='/login';h.api.startClassHome();assert.ok(h.events.pagehide);assert.ok(h.events.pageshow);h.api.catalogueState.rows=[{id:'1'}];h.ctx.location.pathname='/problem-sets/dashboard';const exiting=h.api.loadCatalogueOverviews(0);h.events.pagehide();assert.equal(h.api.catalogueState.suspended,true);assert.equal(h.active(),0);h.intervals.forEach(fn=>fn());assert.equal(h.api.catalogueState.status,'idle');await h.flush(exiting);assert.equal(h.api.catalogueState.rows.length,0);h.ctx.location.pathname='/login';h.events.pageshow();assert.equal(h.api.catalogueState.suspended,false);
 console.log('PASS dynamic overview lifecycle: exactly 200 cap, max 2 frames, >=500ms global spacing, redirect abort, bounded timeout, route cancellation and stale-result rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
