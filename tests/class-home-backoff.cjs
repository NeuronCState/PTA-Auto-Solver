const assert=require('node:assert/strict'),{harness}=require('./class-home-api.cjs');
(async()=>{
 let h=harness({total:1,mode:'once429'});h.ctx.retryAfter='10';await h.flush(h.api.loadClassCatalogue());assert.equal(h.api.catalogueState.status,'ready');assert.equal(h.calls.length,4);assert.ok(h.calls[1].at-h.calls[0].at>=10000);
 h=harness({total:1,mode:'list429'});await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length,2);assert.equal(h.api.catalogueState.status,'partial');assert.match(h.api.catalogueState.message,/限流/);
 h=harness({total:1,mode:'once429'});h.ctx.retryAfter='999999';await h.flush(h.api.loadClassCatalogue());assert.equal(h.calls.length,1);assert.equal(h.api.catalogueState.status,'partial');
 h=harness({total:1,mode:'once429'});const p=h.api.loadClassCatalogue();for(let i=0;i<40;i++)await Promise.resolve();h.api.stopClassCatalogue();await h.flush(p);assert.equal(h.calls.length,1);assert.equal(h.api.catalogueState.status,'idle');
 h=harness({total:10,delay:1500});await h.flush(h.api.loadClassCatalogue());assert.equal(h.max(),4);for(let i=1;i<h.calls.length;i++)assert.ok(h.calls[i].at-h.calls[i-1].at>=250);
 console.log('PASS: 4 workers/250ms spacing, Retry-After respected, bounded retry budget, no wait beyond deadline, cancellation interrupts backoff');
})().catch(e=>{console.error(e);process.exitCode=1;});
