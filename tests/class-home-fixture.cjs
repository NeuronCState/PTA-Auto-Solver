// Optional real diagnostic validation. Never commits or prints private fixture content.
// PTA_DIAGNOSTIC_DIR=/path/to/private/diagnostics node tests/class-home-fixture.cjs
const fs=require('node:fs'),assert=require('node:assert/strict');
const vm=require('node:vm');
(async()=>{
 const dir=process.env.PTA_DIAGNOSTIC_DIR;if(!dir){console.log('SKIP private diagnostic DOM test: PTA_DIAGNOSTIC_DIR not set');return;}
 const source=fs.readFileSync(process.env.PTA_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
 const code=source.slice(source.indexOf('    function catalogueRoute('),source.indexOf('    function render()'));
 const lists=JSON.parse(fs.readFileSync(dir+'/pta-diagnostics-1794048619127.json')).records;
 const overview=JSON.parse(fs.readFileSync(dir+'/pta-diagnostics-1794048976470.json')).records[0];
 const {DOMParser}=require(process.env.PTA_DOM_MODULE || 'linkedom');
 const api=vm.runInNewContext(code+';({catalogueRows,cataloguePagination,catalogueOverview})',{URL,Map,Set,location:{origin:'https://pintia.cn'}});
 const parse=html=>new DOMParser().parseFromString(html,'text/html');
 const all=lists.find(r=>new URL(r.url).pathname==='/problem-sets/all');const doc=parse(all.html),rows=api.catalogueRows(doc),pagination=api.cataloguePagination(doc);
 const result=JSON.parse(JSON.stringify({rowCount:rows.length,unique:new Set(rows.map(r=>r.id)).size,groups:rows.every(r=>r.group!=='未标注班级'),links:rows.every(r=>/^https:\/\/pintia.cn\/problem-sets\/\d+\/exam$/.test(r.href)),pagination,metrics:api.catalogueOverview(parse(overview.html))}));
  assert.equal(result.rowCount,30);assert.equal(result.unique,30);assert.equal(result.groups,true);assert.equal(result.links,true);assert.deepEqual(result.pagination,{start:1,end:30,total:72});
  assert.deepEqual(result.metrics,{score:'0',progress:'0 %',answered:0,total:66});
  console.log('PASS actual private diagnostic DOM: 30 distinct classified cards of 72; overview 0/66, 0%, score 0; ranking not used. Offline DOM parser; no network requests sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
