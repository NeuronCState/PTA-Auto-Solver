const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=src.slice(src.indexOf('    function catalogueRoute('),src.indexOf('    function render()'));
function card(id,{title='Example',group='Class A',deadline='2026-11-11 18:14',status=['已开放'],href}={}) {
 const groupNode={textContent:group};const spans=[{textContent:'来源用户组:',nextElementSibling:groupNode},groupNode,...status.map(textContent=>({textContent}))];
 return {getAttribute:()=>href||`https://pintia.cn/problem-sets/${id}/overview`,querySelector:s=>s==='.font-bold'?{textContent:title}:null,querySelectorAll:()=>spans,closest:()=>null,textContent:`${title}关闭时间:${deadline}来源用户组:${group}${status.join('')}`};
}
function page(cards,start,end,total,next) {
 return {querySelectorAll:()=>cards,querySelector:s=>s.includes('paginationSummary')?{textContent:`显示 ${start} 至 ${end} 条，共 ${total} 条数据`}:s.includes('paginationControls')?{querySelectorAll:()=>[
 {className:'pageItem active_abc',textContent:String(start===1?1:2)},
 ...(next?[{className:'pageItem',textContent:'2',classList:{contains:()=>false},getAttribute:()=>null,click:next}]:[])]}:null};
}
function harness(pages){
 const current=pages[0]||page([],0,0,0);
 const ctx={Date,URL,Set,Map,location:{origin:'https://pintia.cn',href:'https://pintia.cn/problem-sets/dashboard',pathname:'/problem-sets/dashboard'},setInterval:()=>{},document:{getElementById:()=>null,querySelector:s=>current.querySelector(s),querySelectorAll:s=>current.querySelectorAll(s),createElement(){throw Error('Must not create frames');}}};
 const api=vm.runInNewContext(section+'({catalogueRoute,catalogueDeadline,catalogueCard,catalogueRows,groupCatalogueRows,cataloguePagination,loadClassCatalogue,stopClassCatalogue,catalogueState,catalogueOverview})',ctx);
 return {api,ctx};
}
(async()=>{
 const h=harness([]),a=h.api;
 function overview(score,progress,rows) {
  const values={'分数':score,'答题进度':progress,'排名':'1/55'};
  const card={querySelector:()=>({textContent:'答题信息'}),querySelectorAll:()=>Object.entries(values).map(([label,value])=>({textContent:label,closest:()=>({parentElement:{querySelector:()=>value===null?null:{textContent:value}}})}))};
  const table={querySelectorAll:s=>s==='thead th'?['题型','进度','已作答','总题数'].map(textContent=>({textContent})):rows.map(([a,t])=>({querySelectorAll:()=>['判断题','0%',a,t].map(textContent=>({textContent}))}))};
  return {querySelectorAll:s=>s==='.Card'?[card]:[table]};
 }
 let metrics=a.catalogueOverview(overview('0','0 %',[['0','26'],['0','29'],['0','11']]));
 assert.equal(metrics.score,'0');assert.equal(metrics.progress,'0 %');assert.equal(metrics.answered,0);assert.equal(metrics.total,66);
 assert.equal(a.catalogueOverview(overview(null,null,[])),null);
 metrics=a.catalogueOverview(overview('8','101%',[['11','10']]));assert.equal(metrics.progress,null);assert.equal(metrics.total,null);
 assert.ok(!section.includes('contentWindow'));assert.ok(!section.includes("createElement('iframe')"));

 assert.equal(a.catalogueRoute('/problem-sets/dashboard'),true);assert.equal(a.catalogueRoute('/problem-sets/12/exam'),false);
 assert.equal(a.catalogueDeadline('2026-02-30 12:00'),Infinity);assert.equal(a.catalogueDeadline('2026-11-11 24:00'),Infinity);
 assert.ok(Number.isFinite(a.catalogueDeadline('2026-11-11 18:14')));
 assert.equal(a.catalogueCard(card('1')).href,'https://pintia.cn/problem-sets/1/exam');
 assert.equal(a.catalogueCard(card('1',{href:'https://evil.invalid/problem-sets/1/overview'})),null);
 assert.equal(a.catalogueCard(card('1',{group:''})).group,'未标注班级');
 assert.equal(a.catalogueCard(card('1',{title:'<script>alert(1)</script>'})).title,'<script>alert(1)</script>');
 const rows=a.catalogueRows(page([card('1'),card('1'),card('2',{group:'Class B'})],1,3,3));assert.equal(rows.length,2);
 const grouped=a.groupCatalogueRows([a.catalogueCard(card('1',{deadline:'unknown'})),a.catalogueCard(card('2',{deadline:'2026-12-11 10:00'})),a.catalogueCard(card('3',{deadline:'2026-11-11 10:00'}))]);
 assert.equal(grouped.groups[0].items.map(x=>x.id).join(','),'3,2,1');
 assert.match(src,/section\.open=false/);assert.ok(!section.includes('innerHTML'));assert.ok(!section.includes('localStorage'));assert.ok(!section.includes('GM_xmlhttpRequest'));
 console.log('PASS: class parsing/sorting, safe links, no frame navigation or unsafe HTML');
})().catch(e=>{console.error(e);process.exitCode=1;});
