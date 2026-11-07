const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const code=src.slice(src.indexOf('    function catalogueRoute('),src.indexOf('    function render()'));
function harness({total=72,mode='',delay=0,dom=[],storage=null}={}){
 const baseline=Date.UTC(2026,10,7);let now=baseline,seq=0,active=0,max=0;const timers=new Map(),calls=[],events={},intervals=[];
 const setTimer=(fn,ms)=>{timers.set(++seq,{fn,at:now+ms});return seq;};
 const ctx={URL,Set,Map,AbortController,Uint8Array,TextDecoder,Date:class extends Date{static now(){return now;}},setTimeout:setTimer,clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),location:{origin:'https://pintia.cn',pathname:'/problem-sets/dashboard'},window:{addEventListener:(k,fn)=>events[k]=fn},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement(){throw Error('no embedded document');}},fetch:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Accept,'application/json;charset=UTF-8');assert.deepEqual(Object.keys(options.headers),['Accept']);
  const u=new URL(url);calls.push({url:u,at:now});active++;max=Math.max(max,active);
  if(delay)await new Promise((resolve,reject)=>{const t=setTimer(resolve,delay);options.signal.addEventListener('abort',()=>{timers.delete(t);reject(Error('abort'));},{once:true});});
  let data,status=200;
  if(u.pathname==='/api/problem-sets'){
   const page=Number(u.searchParams.get('page'));assert.equal(u.searchParams.get('filter'),'{}');assert.equal(u.searchParams.get('limit'),'30');
   if(mode==='list403')status=403;
   if(mode==='list429'||(mode==='once429'&&calls.length===1))status=429;
   const ids=Array.from({length:Math.max(0,Math.min(30,total-page*30))},(_,i)=>String(page*30+i+1));
   data={examIdByProblemSetId:ctx.omitExamMap?undefined:Object.fromEntries(ids.map(id=>[id,String(1000+Number(id))])),total:mode==='changed'&&page>0?total+1:total,problemSets:ids.map(id=>({id:mode==='duplicate'&&page>0?'1':id,name:'Set '+id,endAt:ctx.endAtById&&Object.prototype.hasOwnProperty.call(ctx.endAtById,id)?ctx.endAtById[id]:'2027-01-01T00:00:00Z',startAt:ctx.startAtById&&ctx.startAtById[id]||'2026-01-01T00:00:00Z'})),userGroupsByProblemSetId:Object.fromEntries(ids.map(id=>[id,{items:[{id:String(Number(id)%3+900),name:'Class '+Number(id)%3}]}]))};
  }else if(u.pathname.endsWith('/exams')){
   const id=u.pathname.split('/')[3];if(mode==='exam401')status=401;if(mode==='exam403'&&id==='1')status=403;
   data={exam:mode==='noexam'&&id==='1'?null:{id:String(1000+Number(id)),score:id==='1'?0:80,problemSetId:id,userId:ctx.omitUser?undefined:String(ctx.userBySet&&ctx.userBySet[id]||ctx.testUserId||'5000')}};
  }else{
   if(mode==='status429')status=429;
   data={problemStatus:Array.from({length:40},(_,i)=>({id:String(i+1),score:2,problemSubmissionStatus:i<32?'PROBLEM_SUBMITTED':'PROBLEM_ACCEPTED'}))};
   if(mode==='unknown')data.problemStatus[0].problemSubmissionStatus='UNVERIFIED';
  }
  active--;const body=mode==='html'?'<!doctype html><html>PRIVATE LOGIN SECRET</html>':mode==='empty'?'':mode==='non-json'?'PRIVATE SECRET not json':JSON.stringify(data);const bytes=new TextEncoder().encode(body);let read=false;
  return {headers:{get:name=>{assert.equal(name,'Retry-After');return ctx.retryAfter||null;}},status,ok:status>=200&&status<300,redirected:false,url,body:{getReader:()=>({read:async()=>read?{done:true}:(read=true,{done:false,value:bytes}),cancel:async()=>{}})}};
 }};
 ctx.getTestRows=()=>dom.map(row=>Object.assign({},row));
 const diagnosticRecords=[];ctx.apiDiagnostics={enabled:false,generation:1};ctx.apiDiagnosticTarget=url=>({path:new URL(url).pathname.replace(/\/\d+/g,'/:id'),method:'GET'});ctx.addApiDiagnostic=(...args)=>diagnosticRecords.push(args);
 if(storage){ctx.GM_getValue=(key,fallback)=>storage.has(key)?storage.get(key):fallback;ctx.GM_setValue=(key,value)=>storage.set(key,value);ctx.GM_deleteValue=key=>storage.delete(key);}
 const api=vm.runInNewContext(code+'; catalogueRows=function(){return getTestRows();};({catalogueState,loadClassCatalogue,stopClassCatalogue,startClassHome,syncCatalogueDOM,catalogueAPIRow,catalogueAPIMetrics,groupCatalogueRows,catalogueCache,clearCatalogueCache,catalogueCacheWrite,catalogueCacheRead,catalogueProgressQueue,cataloguePersistence,loadPersistentCatalogueCache,flushPersistentCatalogueCache,clearPersistentCatalogueCache,getVerifiedCatalogueIdentity,catalogueValidateStored})',ctx);
 async function flush(p){let done=false,error;Promise.resolve(p).then(()=>done=true,e=>{done=true;error=e;});for(let i=0;!done&&i<20000;i++){for(let j=0;j<40;j++)await Promise.resolve();if(!done&&timers.size){let [id,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=t.at;t.fn();}}assert.ok(done,'settled');if(error)throw error;}
 return {api,ctx,calls,events,intervals,flush,diagnosticRecords,setDOM:rows=>{dom=rows;},max:()=>max,now:()=>now-baseline,advance:ms=>{now+=ms;}};
}
if(require.main===module)(async()=>{
 let h=harness({delay:700});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'ready');assert.equal(h.api.catalogueState.rows.length,72);assert.equal(h.calls.filter(c=>c.url.pathname==='/api/problem-sets').length,3);assert.equal(h.calls.length,147);assert.ok(h.max()<=4);assert.ok(h.max()>=2);
 for(let i=1;i<h.calls.length;i++)assert.ok(h.calls[i].at-h.calls[i-1].at>=250,'global spacing');
 assert.equal(h.api.catalogueState.rows[0].metrics.score,'0');assert.equal(h.api.catalogueState.rows[0].metrics.answered,40);assert.equal(h.api.catalogueState.rows[0].metrics.progress,'100%');assert.equal(h.api.groupCatalogueRows(h.api.catalogueState.rows).groups.length,3);
 const row=h.api.catalogueAPIRow({id:'1',name:'<script>x</script>',endAt:'n/a'},new Map(),{'1':{items:[{id:'4',name:'Same'},{id:'5',name:'Same'},{id:'4',name:'Same'}]}});assert.equal(row.groups.length,2);assert.equal(h.api.groupCatalogueRows([row]).groups.length,2);assert.equal(row.title,'<script>x</script>');assert.equal(row.deadlineOrder,Infinity);
 assert.equal(h.api.catalogueAPIRow({id:'../../other',name:'bad'},new Map()),null);
 assert.equal(h.api.catalogueAPIRow({id:'1',name:'good'},new Map(),{'1':{items:[]}}).group,'未标注班级');
 let metrics=h.api.catalogueAPIMetrics({exam:{score:0}},{problemStatus:[{id:'1',score:0,problemSubmissionStatus:'PROBLEM_SUBMITTED'},{id:'2',score:0,problemSubmissionStatus:'PROBLEM_NO_ANSWER'}]});assert.equal(metrics.answered,1);assert.equal(metrics.total,2);assert.equal(metrics.progress,'50%');
 metrics=h.api.catalogueAPIMetrics({exam:{score:8}},{problemStatus:[{id:'1',problemSubmissionStatus:'PROBLEM_ACCEPTED'},{id:'1',problemSubmissionStatus:'PROBLEM_ACCEPTED'}]});assert.equal(metrics.answered,null);assert.equal(metrics.score,'8');
 h=harness({total:0});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'ready');assert.equal(h.calls.length,1);
 for(const mode of ['list403','list429','changed','duplicate']){h=harness({mode,total:35});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'partial');assert.equal(h.calls.filter(c=>c.url.pathname.endsWith('/exams')).length,0);}
 h=harness({mode:'exam403',total:2});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.rows[0].metricsState,'unavailable');assert.equal(h.api.catalogueState.rows[1].metrics.answered,40);
 h=harness({mode:'noexam',total:2});await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length,4);assert.match(h.api.catalogueState.rows[0].metricsNote,/未自动开考/);
 h=harness({mode:'unknown',total:1});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.rows[0].metrics.answered,null);assert.equal(h.api.catalogueState.rows[0].metrics.score,'0');
 for(const mode of ['exam401','status429']){h=harness({mode,total:5});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'partial');assert.ok(h.calls.length<10);assert.equal(h.api.catalogueState.job,null);}
 h=harness({total:205});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.rows.length,205);assert.equal(h.calls.filter(c=>c.url.pathname.endsWith('/exams')).length,200);assert.match(h.api.catalogueState.message,/前200/);assert.equal(h.api.catalogueProgressQueue(h.api.catalogueState.rows).slice(200).filter(r=>r.metricsState==='unavailable').length,5);
 console.log('PASS: observed API schema, 72-set pagination/groups/40-of-40 score, multiple class identity, unknown/zero correctness, limits/rate spacing/concurrency, denial and no exam creation');
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={harness};
