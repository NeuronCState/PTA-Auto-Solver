// Optional private evidence validation; raw user diagnostics are never committed.
const fs=require('node:fs'),assert=require('node:assert/strict');
const dir=process.env.PTA_API_DIAGNOSTIC_DIR;
if(!dir)console.log('SKIP private API evidence: PTA_API_DIAGNOSTIC_DIR not set');
else{
 const overview=JSON.parse(fs.readFileSync(dir+'/pta-api-shape-1794052358574.json','utf8'));
 const directory=JSON.parse(fs.readFileSync(dir+'/pta-api-shape-1794052457719.json','utf8'));
 assert.equal(overview.format,'pta-api-shape-v2');assert.equal(directory.format,'pta-api-shape-v2');
 const exam=overview.records.find(r=>r.request.path==='/api/problem-sets/:id/exams');assert.equal(exam.status,200);assert.equal(exam.response.exam.score,80);
 const statuses=overview.records.find(r=>r.request.path==='/api/exams/:id/problem-sets/:id/problem-status');assert.equal(statuses.status,200);assert.equal(statuses.response.problemStatus.arrayLength,40);statuses.response.problemStatus.samples.forEach(sample=>assert.equal(sample.id,'[string]'));assert.equal(statuses.response.examLabelByProblemSetProblemId.numericKeyCount,40);assert.deepEqual(statuses.response.problemStatus.statusCounts,{PROBLEM_SUBMITTED:32,PROBLEM_ACCEPTED:8});
 const lists=directory.records.filter(r=>r.request.path==='/api/problem-sets' && r.request.limit===30);assert.ok(lists.length>0);
 for(const r of lists){assert.equal(r.status,200);assert.equal(r.response.total,72);assert.equal(r.response.problemSets.arrayLength,30);assert.equal(r.response.userGroupsByProblemSetId.numericKeyCount,30);for(const sample of r.response.userGroupsByProblemSetId.numericKeySamples){assert.ok(sample.items.arrayLength>0);assert.equal(sample.items.samples[0].id,'[string]');assert.equal(sample.items.samples[0].name,'[string]');}}
 console.log('PASS private projected API evidence: list total72/page30, group map by set ID with items id/name, score80 and 32 submitted +8 accepted. Not a live end-to-end test.');
}
