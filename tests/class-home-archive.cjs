const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8'),state={rows:[],source:'api',status:'ready',total:0};
const code=src.slice(src.indexOf('    function catalogueArchiveGroups('),src.indexOf('    function toggleCatalogueGroup('));
const ctx={catalogueState:state,Date,Set};vm.createContext(ctx);vm.runInContext(code,ctx);
function row(id,status='已关闭',date=Date.now()-1000){return {id,status,deadlineOrder:date,groupsVerified:true};}
function run(rows,extra={},key='id:1'){Object.assign(state,{rows,source:'api',status:'ready',total:rows.length},extra);return ctx.catalogueArchiveGroups({groups:[{key,name:'Class',items:rows}]});}
let out=run([row('1'),row('2')]);assert.equal(out.archived.length,1);assert.equal(out.current.length,0);assert.equal(out.archived[0].items.length,2);
for(const extra of [{source:'dom'},{status:'loading'},{status:'partial'},{total:3},{total:null}])assert.equal(run([row('1')],extra).archived.length,0);
for(const r of [row('2','已开放'),row('2','未开放',Date.now()+100000),row('2','状态未提供',Infinity),row('2','已关闭',Infinity),row('2','已关闭',Date.now()+100000),Object.assign(row('2'),{groupsVerified:false})])assert.equal(run([row('1'),r]).archived.length,0);
assert.equal(run([row('1'),row('1')]).archived.length,0);
assert.equal(run([],{},'id:1').archived.length,0);
assert.equal(run([row('1')],{},'name:班级待确认').archived.length,0);
const shared=row('7'),active=row('8','已开放',Date.now()+1000);Object.assign(state,{rows:[shared,active],source:'api',status:'ready',total:2});
out=ctx.catalogueArchiveGroups({groups:[{key:'id:A',items:[shared]},{key:'id:B',items:[shared,active]}]});assert.equal(out.archived.length,1);assert.equal(out.current.length,1);assert.equal(out.current[0].items[0],shared,'shared set preserved in active class');
assert.match(src,/\.pta-catalog-group > summary\{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;min-height:44px;padding:10px/);
assert.match(src,/archiveSummary.addEventListener\('click'/);assert.ok(!src.includes("section.addEventListener('click'"),'question links must not toggle parent');
console.log('PASS conservative class archive: complete API/mapping only, closed timestamps, partial/unknown retention, shared membership, native full-width summary');
