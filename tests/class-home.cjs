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
 let index=0,removed=0,frame,clock=0;
 const FakeDate=class extends Date{static now(){return clock;}};
 const ctx={Date:FakeDate,URL,Set,Map,location:{origin:'https://pintia.cn',href:'https://pintia.cn/problem-sets/dashboard',pathname:'/problem-sets/dashboard'},setTimeout:fn=>{clock+=250;fn();},setInterval:()=>{},document:{getElementById:()=>null,querySelector:()=>null,createElement(tag){assert.equal(tag,'iframe'); frame={setAttribute(){},style:{},contentWindow:{location:{href:'https://pintia.cn/problem-sets/all'}},get contentDocument(){return pages[index];},remove(){removed++;}};return frame;},body:{appendChild(){}}}};
 const api=vm.runInNewContext(section+'({catalogueRoute,catalogueDeadline,catalogueCard,catalogueRows,groupCatalogueRows,cataloguePagination,catalogueNextPage,loadClassCatalogue,stopClassCatalogue,catalogueFrameDocument,catalogueState,catalogueOverview})',ctx);
 return {api,ctx,next:()=>{index++;},removed:()=>removed,frame:()=>frame};
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
 assert.match(section,/Promise.all\(\[worker\(\),worker\(\)\]\)/);assert.match(section,/slice\(0,200\)/);assert.match(section,/180000/);

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
 let multi=harness([]);const pages=[page([card('1'),card('2')],1,2,3,()=>multi.next()),page([card('3')],3,3,3)];multi=harness(pages);await multi.api.loadClassCatalogue();assert.equal(multi.api.catalogueState.status,'ready');assert.equal(multi.api.catalogueState.rows.length,3);assert.ok(multi.removed()>0);assert.equal(multi.frame().name,'pta-catalog-reader');assert.ok(multi.frame().style.cssText.includes('visibility:hidden'));
 const partial=harness([page([card('1')],1,1,2)]);await partial.api.loadClassCatalogue();assert.equal(partial.api.catalogueState.status,'partial');assert.equal(partial.api.catalogueState.rows.length,1);
 const empty=harness([page([],0,0,0)]);await empty.api.loadClassCatalogue();assert.equal(empty.api.catalogueState.status,'ready');assert.equal(empty.api.catalogueState.rows.length,0);
 assert.throws(()=>a.catalogueFrameDocument({contentWindow:{location:{href:'https://pintia.cn/login'}}}),/登录/);
 assert.throws(()=>a.catalogueFrameDocument({contentWindow:{location:{href:'https://evil.invalid/'}}}),/登录/);
 const noSummary=harness([{querySelector:()=>null,querySelectorAll:()=>[]}]);await noSummary.api.loadClassCatalogue();assert.equal(noSummary.api.catalogueState.status,'error');assert.match(noSummary.api.catalogueState.message,/超时/);
 multi.api.stopClassCatalogue();assert.equal(multi.api.catalogueState.rows.length,0);assert.equal(multi.api.catalogueState.status,'idle');
 assert.match(src,/section\.open=false/);assert.match(src,/window\.name === 'pta-catalog-reader'/);assert.ok(!section.includes('innerHTML'));assert.ok(!section.includes('localStorage'));assert.ok(!section.includes('GM_xmlhttpRequest'));assert.match(section,/pageNo<50/);assert.match(section,/120000/);
 console.log('PASS: class card extraction, date sorting, scoped safe links, collapsed groups, invisible same-origin paging, partial/timeout/login guards, cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
