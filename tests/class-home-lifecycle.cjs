const assert=require('node:assert/strict');const {harness}=require('./class-home-api.cjs');
(async()=>{
 let h=harness({total:2,delay:700});const pending=h.api.loadClassCatalogue();h.api.stopClassCatalogue();await h.flush(pending);assert.equal(h.api.catalogueState.status,'idle');assert.equal(h.api.catalogueState.rows.length,0);
 h=harness({total:3,delay:700});const first=h.api.loadClassCatalogue(),second=h.api.loadClassCatalogue();await h.flush(Promise.all([first,second]));assert.equal(h.api.catalogueState.status,'ready');assert.equal(h.api.catalogueState.rows.length,3);assert.ok(h.api.catalogueState.rows.every(r=>r.metrics.answered===40));
 h=harness({total:2,delay:700});h.api.startClassHome();h.events.pagehide();h.intervals.forEach(f=>f());await h.flush(Promise.resolve());assert.equal(h.api.catalogueState.suspended,true);assert.equal(h.api.catalogueState.rows.length,0);assert.equal(h.api.catalogueState.status,'idle');
 h.events.pageshow();await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'ready');assert.equal(h.api.catalogueState.suspended,false);
 const calls=h.calls.length;for(let i=0;i<10;i++)h.intervals.forEach(f=>f());await h.flush(Promise.resolve());assert.equal(h.calls.length,calls,'completed snapshot cached in memory; no polling');
 h.ctx.location.pathname='/problem-sets/2/exam';h.intervals.forEach(f=>f());assert.equal(h.api.catalogueState.status,'idle');assert.equal(h.api.catalogueState.rows.length,0);
 h=harness({delay:20000});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'partial');assert.equal(h.calls.length,1);assert.match(h.api.catalogueState.message,/超时/);
 h=harness({total:201,delay:14000});await h.flush(h.api.loadClassCatalogue());assert.ok(h.now()<=300000);assert.equal(h.api.catalogueState.status,'partial');assert.equal(h.api.catalogueState.job,null);assert.ok(h.calls.filter(c=>c.url.pathname.endsWith('/exams')).length<200);
 console.log('PASS: cancellation, refresh supersession, pagehide/pageshow, no background polling, route exit cleanup, 15s request and 5min run bounds');
})().catch(e=>{console.error(e);process.exitCode=1;});
