const assert=require('node:assert/strict'),{harness}=require('./class-home-api.cjs');
const card=id=>({id:String(id),title:'Visible '+id,group:'Visible class',deadline:'',deadlineOrder:Infinity,status:'已开放',href:'https://pintia.cn/problem-sets/'+id+'/exam'});
(async()=>{
 // DOM rows are displayed immediately, never mixed/duplicated into API results.
 let h=harness({total:2,delay:700,dom:[card(1)]});const p=h.api.loadClassCatalogue();assert.equal(h.api.catalogueState.rows.length,1);assert.equal(h.api.catalogueState.source,'dom');await h.flush(p);assert.equal(h.api.catalogueState.source,'api');assert.equal(h.api.catalogueState.rows.length,2);assert.equal(h.api.catalogueState.rows[0].title,'Set 1');
 for(const mode of ['html','non-json','empty','list403']){
  h=harness({total:2,mode,dom:[card(1)]});h.ctx.apiDiagnostics.enabled=true;await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'partial');assert.equal(h.api.catalogueState.source,'dom');assert.equal(h.api.catalogueState.rows.length,1);assert.equal(h.api.catalogueState.rows[0].group,'Visible class');assert.equal(h.api.catalogueState.rows[0].metricsState,'unavailable');assert.match(h.api.catalogueState.message,/当前页 1/);assert.equal(h.calls.length,1,'no retries or alternate auth flow');
  h.setDOM([card(2),card(3)]);h.api.syncCatalogueDOM();assert.equal(h.api.catalogueState.rows.length,2);assert.equal(h.api.catalogueState.rows[0].id,'2');assert.match(h.api.catalogueState.message,/当前页 2/);assert.equal(h.calls.length,1,'SPA fallback reads DOM only');
  const exported=JSON.stringify(h.diagnosticRecords);assert.ok(!exported.includes('PRIVATE'));assert.ok(!exported.includes('SECRET'));if(mode!=='list403'){assert.equal(h.diagnosticRecords.length,1);assert.ok(h.diagnosticRecords[0][3].includes(mode==='non-json'?'non-json':mode));assert.equal(h.diagnosticRecords[0][2],undefined);}
 }
 // The DOM can arrive after the API failure; the next sync still recovers it.
 h=harness({mode:'html'});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.rows.length,0);h.setDOM([card(9)]);h.api.syncCatalogueDOM();assert.equal(h.api.catalogueState.rows[0].id,'9');assert.equal(h.diagnosticRecords.length,0,'diagnostic off by default');
 h.ctx.location.pathname='/problem-sets/9/exam';h.api.stopClassCatalogue();h.api.syncCatalogueDOM();assert.equal(h.api.catalogueState.rows.length,0);
 console.log('PASS: explicit JSON Accept, visible DOM during loading/after HTML or failure, late SPA fallback, API replacement without duplicates, no retry or raw-body diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1;});
