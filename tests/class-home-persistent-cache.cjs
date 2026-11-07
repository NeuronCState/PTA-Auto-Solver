const assert=require('node:assert/strict'),{harness}=require('./class-home-api.cjs');
const KEY='pta-catalogue-cache-v1',statusCalls=h=>h.calls.filter(c=>c.url.pathname.endsWith('/problem-status')).length;
(async()=>{
 const storage=new Map();let h=harness({total:2,storage});await h.flush(h.api.loadClassCatalogue());let stored=JSON.parse(storage.get(KEY));assert.equal(stored.owner,'5000');assert.equal(stored.entries.length,2);assert.equal(stored.snapshot.rows.length,2);assert.deepEqual([...storage.keys()],[KEY]);
 const firstAt=stored.entries[0].at;
 // New document: disk owner is not identity. Only a fresh matching response unlocks it.
 let next=harness({total:2,storage});next.advance(5000);await next.api.loadPersistentCatalogueCache();assert.equal(next.api.catalogueCache.owner,null);assert.equal(next.api.getVerifiedCatalogueIdentity(),null);assert.equal(next.api.catalogueCache.items.size,0);
 await next.flush(next.api.loadClassCatalogue());assert.equal(statusCalls(next),0);assert.equal(next.api.catalogueState.rows[0].metricsCached,true);assert.equal(next.api.catalogueState.rows[0].metricsAt,firstAt);assert.equal(next.api.getVerifiedCatalogueIdentity().userId,'5000');
 await next.flush(next.api.loadClassCatalogue(true));assert.equal(statusCalls(next),2,'manual refresh bypasses persisted active cache');
 // Different account cannot view or update another owner's entries.
 next=harness({total:2,storage});next.advance(10000);next.ctx.testUserId='6000';await next.flush(next.api.loadClassCatalogue());assert.equal(statusCalls(next),2);assert.equal(JSON.parse(storage.get(KEY)).owner,'6000');assert.ok(next.api.catalogueState.rows.every(r=>!r.metricsCached));
 // Missing current identity cannot unlock persisted data.
 let missing=harness({total:2,storage});missing.advance(12000);missing.ctx.omitUser=true;await missing.flush(missing.api.loadClassCatalogue());assert.equal(statusCalls(missing),2);assert.equal(missing.api.catalogueCache.owner,null);assert.equal(missing.api.getVerifiedCatalogueIdentity(),null);
 // Ended history requires both freshly verified owner and listed exam identity.
 let ended=harness({total:2,storage});ended.advance(15000);ended.ctx.testUserId='6000';ended.ctx.endAtById={'1':'2025-01-01T00:00:00Z'};await ended.flush(ended.api.loadClassCatalogue());assert.equal(statusCalls(ended),0);assert.equal(ended.api.catalogueState.rows[0].metricsCached,true);
 let stale=harness({total:2,storage});stale.advance(8*24*60*60*1000);stale.ctx.testUserId='6000';await stale.flush(stale.api.loadClassCatalogue());assert.equal(statusCalls(stale),2,'seven-day entries cannot survive hydration');
 // Clear persists, clears memory, and leaves no automatic reread running.
 assert.equal(await stale.api.clearPersistentCatalogueCache(),true);assert.equal(storage.has(KEY),false);assert.equal(stale.api.catalogueCache.items.size,0);assert.equal(stale.api.getVerifiedCatalogueIdentity(),null);
 const corrupt=harness({total:1,storage:new Map([[KEY,JSON.stringify({version:1,owner:'BAD OWNER',entries:[]})]])});await corrupt.flush(corrupt.api.loadClassCatalogue());assert.equal(statusCalls(corrupt),1);
 assert.equal(corrupt.api.catalogueValidateStored('{not JSON'),null);assert.equal(corrupt.api.catalogueValidateStored('x'.repeat(1024*1024+1)),null);
 const invalid={version:1,owner:'5000',entries:[{id:'1',examId:'2',at:Date.UTC(2026,10,7),metrics:{answered:10,total:1,score:'1'}}]};assert.equal(corrupt.api.catalogueValidateStored(JSON.stringify(invalid)).entries.length,0);
 // An in-flight old storage read cannot resurrect data after the clear action.
 const race=harness({total:1,storage:new Map()});let release;race.ctx.GM_getValue=()=>new Promise(resolve=>{release=resolve;});const reading=race.api.loadPersistentCatalogueCache();await race.api.clearPersistentCatalogueCache();release(JSON.stringify(stored));await reading;assert.equal(race.api.cataloguePersistence.stored,null);assert.equal(race.api.catalogueCache.items.size,0);
 // Queued/in-flight writes are ordered before deletion, never after it.
 const writeStorage=new Map(),writing=harness({total:1,storage:writeStorage});let finishWrite;
 writing.ctx.GM_setValue=(key,value)=>new Promise(resolve=>{finishWrite=()=>{writeStorage.set(key,value);resolve();};});
 writing.api.catalogueCache.owner='5000';writing.api.catalogueCacheWrite({userId:'5000'},{id:'1',metrics:{answered:1,total:1,progress:'100%',score:'1'}},{id:'1001',userId:'5000'});
 const writePromise=writing.api.flushPersistentCatalogueCache();await Promise.resolve();const clearing=writing.api.clearPersistentCatalogueCache();finishWrite();await writePromise;await clearing;assert.equal(writeStorage.has(KEY),false);
 // Storage failures fall back to volatile operation, not silent promises of persistence.
 const denied=harness({total:1,storage:new Map()});denied.ctx.GM_getValue=()=>{throw Error('denied');};denied.ctx.GM_setValue=()=>{throw Error('denied');};await denied.flush(denied.api.loadClassCatalogue());assert.equal(denied.api.catalogueState.rows[0].metrics.answered,40);assert.match(denied.api.catalogueState.message,/本地缓存暂不可用/);
 const text=JSON.stringify(stored);for(const field of ['apiKey','Authorization','cookie','token','password'])assert.ok(!text.includes(field));
 console.log('PASS: GM persistence across documents, no stored-owner authentication, account/exam isolation, TTL/force refresh, metadata snapshot, explicit clear and late-read race, corruption/storage failure, no credentials');
})().catch(e=>{console.error(e);process.exitCode=1;});
