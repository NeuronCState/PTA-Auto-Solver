const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const section=src.slice(src.indexOf('    var apiDiagnostics ='),src.indexOf('    // Opt-in diagnostics:'));
const ctx={Set,WeakMap,URL};vm.createContext(ctx);vm.runInContext(section,ctx);
for(const k of ['problemSetIdToUserGroupIdsMap','problem_set_user_group_mapping','userGroupNames','sourceUserGroupInfo','problemSetPermissions','problemStatusById'])assert.equal(ctx.apiDiagnosticFieldName(k),true,k);
for(const k of ['alice','zhangXuanning','privateUserSecret','accessToken','authorization','Cookie','sessionId','apiKey','ownerEmail','userPhone','182736451','123ABC','__proto__','constructor'])assert.equal(ctx.apiDiagnosticFieldName(k),false,k);
const input={
 problemSetIdToUserGroupIdsMap:{'1234567890123456789':['9876543210123456789']},
 userGroupNames:{'9876543210123456789':'PRIVATE CLASS'},
 problemSetPermissions:{'1234567890123456789':{permission:15,ownerId:'1234567890123456789'}},
 sourceUserGroupInfo:{name:'PRIVATE NAME',organizationName:'PRIVATE ORG',id:'9876543210123456789'},
 problemStatus:[{id:'1234567890123456789',problemSubmissionStatus:'PROBLEM_SUBMITTED',score:0},{id:'9876543210123456789',problemSubmissionStatus:'PROBLEM_NO_ANSWER',score:0}],
 alice:{name:'PRIVATE'},token:'SECRET',sessionId:'SECRET',apiKey:'SECRET',problemSetTokenMapping:{'123':'SECRET'},
 data:{userGroups:{Alice:'PRIVATE NAME',bob:'PRIVATE NAME','9876543210123456789':{name:'PRIVATE NAME'}}}
};
const shape=ctx.apiDiagnosticShape(input),text=JSON.stringify(shape);
assert.ok(shape.problemSetIdToUserGroupIdsMap);assert.equal(shape.problemSetIdToUserGroupIdsMap.numericKeySamples[0].arrayLength,1);assert.equal(shape.userGroupNames.numericKeySamples[0],'[string]');
assert.equal(shape.problemStatus.samples[0].problemSubmissionStatus,'PROBLEM_SUBMITTED');assert.equal(shape.problemStatus.samples[1].problemSubmissionStatus,'PROBLEM_NO_ANSWER');
for(const bad of ['PRIVATE','SECRET','1234567890123456789','9876543210123456789','alice','Alice','bob','TokenMapping','sessionId','apiKey'])assert.ok(!text.includes(bad),bad);
for(const value of ['free text','SECRET_TOKEN','PROBLEM_SECRET_TOKEN','PROBLEM_123456','PROBLEM_COOKIE_KEY','PROBLEM_ALICE','PROBLEM_ZHANG_XUANNING','PROBLEM_THIS_IS_PRIVATE_TEXT','PROBLEM_ACCEPTED_ALICE','PROBLEM_ANSWER__SAVED'])assert.equal(ctx.apiDiagnosticShape({problemSubmissionStatus:value}).problemSubmissionStatus,'[string]');
assert.equal(ctx.apiDiagnosticShape({problemSubmissionStatus:'PROBLEM_PARTIALLY_ACCEPTED'}).problemSubmissionStatus,'PROBLEM_PARTIALLY_ACCEPTED');
assert.equal(ctx.apiDiagnosticShape({problemType:'MULTIPLE_CHOICE_MORE_THAN_ONE'}).problemType,'MULTIPLE_CHOICE_MORE_THAN_ONE');
const many=ctx.apiDiagnosticShape({problemStatus:[...Array.from({length:6},()=>({problemSubmissionStatus:'PROBLEM_SUBMITTED'})),{problemSubmissionStatus:'PROBLEM_NO_ANSWER'},{problemSubmissionStatus:'SECRET_TOKEN'}]});
assert.equal(many.problemStatus.samples.length,3);assert.equal(many.problemStatus.statusCounts.PROBLEM_SUBMITTED,6);assert.equal(many.problemStatus.statusCounts.PROBLEM_NO_ANSWER,1);assert.equal(many.problemStatus.omittedStatusCount,1);assert.ok(!JSON.stringify(many).includes('SECRET_TOKEN'));
assert.match(src,/format:'pta-api-shape-v2'/);
console.log('PASS: vocabulary-limited schema discovery, group-map shape with no IDs/names, exact problem-status enum family, sensitive and arbitrary keys/values omitted');
