const assert=require('node:assert/strict'),{harness}=require('./class-home-api.cjs');
const statusCalls=h=>h.calls.filter(c=>c.url.pathname.endsWith('/problem-status')).length;
(async()=>{
 let h=harness({total:2});await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueCache.items.size,2);assert.equal(h.api.catalogueCache.owner,'5000');const firstAt=h.api.catalogueState.rows[0].metricsAt;
 await h.flush(h.api.loadClassCatalogue());assert.equal(statusCalls(h),2);assert.ok(h.api.catalogueState.rows.every(r=>r.metricsCached));assert.equal(h.api.catalogueState.rows[0].metricsAt,firstAt);assert.match(h.api.catalogueState.rows[0].metricsNote,/缓存于/);
 await h.flush(h.api.loadClassCatalogue(true));assert.equal(statusCalls(h),4);assert.ok(h.api.catalogueState.rows.every(r=>!r.metricsCached));
 h.advance(300001);await h.flush(h.api.loadClassCatalogue());assert.equal(statusCalls(h),6);
 // Fresh directory evidence marks a now-ended set, not the old cached metadata.
 h.ctx.endAtById={'1':'2025-01-01T00:00:00Z'};let before=h.calls.length;await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length-before,2);assert.equal(h.api.catalogueState.rows[0].lifecycle,'ended');assert.equal(h.api.catalogueState.rows[0].metricsCached,true);assert.match(h.api.catalogueState.rows[0].metricsNote,/已结束，不再刷新/);assert.equal(h.api.catalogueState.rows[0].groupsVerified,true);
 // No active exam to verify this run's account: preserve memory, do not show it.
 h.ctx.endAtById={'1':'2025-01-01T00:00:00Z','2':'2025-01-01T00:00:00Z'};before=h.calls.length;await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length-before,1);assert.ok(h.api.catalogueState.rows.every(r=>!r.metrics));assert.equal(h.api.catalogueCache.items.size,2);
 // A fresh active response for another account invalidates the previous cache.
 h.ctx.endAtById={'1':'2025-01-01T00:00:00Z'};h.ctx.testUserId='6000';await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueCache.owner,'6000');assert.equal(h.api.catalogueCache.items.has('1'),false);assert.equal(h.api.catalogueState.rows[0].metrics,undefined);
 h=harness({total:3});h.ctx.endAtById={'1':''};h.ctx.startAtById={'2':'2030-01-01T00:00:00Z'};await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length,3);assert.equal(h.api.catalogueState.rows[0].lifecycle,'unknown');assert.equal(h.api.catalogueState.rows[1].lifecycle,'upcoming');assert.equal(h.api.catalogueState.rows[2].metrics.answered,40);
 h=harness({total:2});h.ctx.omitUser=true;await h.flush(h.api.loadClassCatalogue());await h.flush(h.api.loadClassCatalogue());assert.equal(statusCalls(h),4);assert.equal(h.api.catalogueCache.items.size,0);
 h=harness({total:2});h.ctx.userBySet={'1':'5000','2':'6000'};await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueCache.items.size,0);assert.ok(h.api.catalogueState.rows.every(r=>!r.metrics));assert.match(h.api.catalogueState.message,/账号发生变化/);
 h=harness({total:1});await h.flush(h.api.loadClassCatalogue());h.api.startClassHome();h.events.pagehide();await h.flush(Promise.resolve());assert.equal(h.api.catalogueCache.items.size,0);assert.equal(h.api.catalogueCache.owner,null);
 h=harness();h.api.catalogueCache.owner='5000';for(let i=0;i<510;i++)h.api.catalogueCacheWrite({userId:'5000'},{id:String(i),metrics:{answered:1,total:1,progress:'100%',score:'1'}},{id:String(i),userId:'5000'});assert.equal(h.api.catalogueCache.items.size,500);assert.equal(h.api.catalogueCache.items.has('0'),false);assert.equal(h.api.catalogueCache.items.has('509'),true);
 const cacheJob={userId:'5000',forceRefresh:false},cacheItem={id:'509',listedExamId:'509'};
 assert.equal(h.api.catalogueCacheRead(cacheJob,cacheItem,{id:'509',score:1},false),false,'missing userId cannot borrow prior job identity');
 assert.equal(h.api.catalogueCacheRead(cacheJob,cacheItem,{id:'510',userId:'5000'},true),false,'different ended exam never reuses old cache');
 assert.equal(h.api.catalogueCacheRead(cacheJob,{id:'509'},null,true),false,'ended cache needs fresh listed exam ID');
 assert.equal(h.api.catalogueCacheRead(cacheJob,cacheItem,null,true),true);
 h.api.catalogueCacheWrite(cacheJob,{id:'new',metrics:{answered:1}},{id:'1'});assert.equal(h.api.catalogueCache.items.has('new'),false);
 console.log('PASS: account-verified 5-minute progress cache, forced refresh/expiry, timestamps, closed-only cached results, unknown/future skip, account changes and page exit clear, 500-entry bound');
})().catch(e=>{console.error(e);process.exitCode=1;});
