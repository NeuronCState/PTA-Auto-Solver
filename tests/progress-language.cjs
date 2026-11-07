const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.env.PTA_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js', 'utf8');
function section(start, end) { const at=source.indexOf(start); return source.slice(at,source.indexOf(end,at)); }
const url = n => `https://pintia.cn/problem-sets/1/exam/problems/type/${n}`;
const rows = [ ['1','判断题',5,5], ['2','单选题',0,41], ['3','多选题',1,8], ['4','填空题',2,5], ['5','程序填空题',1,3], ['6','函数题',0,1], ['7','编程题',0,6] ];
const links = rows.map(([type,name,current,total])=>({href:url(type),text:`${name}\n${current} / ${total}`}));
let route = '2', pageLinks = links;
const progressContext = { location:{get href(){return url(route)},get pathname(){return `/problem-sets/1/exam/problems/type/${route}`}}, document:{body:{text:links.map(l=>l.text).join('\n')}},queryAll:()=>pageLinks,textOf:el=>el.text };
const progress = vm.runInNewContext(section('    function questionProgress()', '    function setQuestionProgress')+'questionProgress',progressContext);
// Sanitized sidebar structure confirmed in the capture: choice 0/41, fill 0/5,
// function 0/1. No raw diagnostic HTML or student information in the fixture.
for (const [type,,current,total] of rows) { route=type; assert.equal(progress().current,current);assert.equal(progress().total,total,`type ${type}`); }
route='2'; links[1].text='单选题\n21 / 41'; assert.equal(progress().current,21);
// Partial DOM: same-type summary fallback must not use unrelated function 0/1.
pageLinks=[];route='4';assert.equal(progress().total,5);assert.equal(progress().current,2);
route='5';assert.equal(progress().total,3); // Three questions, regardless of blanks per question.
route='8';assert.equal(progress(),null);
// Single-problem programming navigation keeps the current question ordinal.
route='7';progressContext.location={pathname:'/exam/problems/type/7',href:url('7')+'?problemSetProblemId=q2'};
pageLinks=['q1','q2','q3'].map(id=>({href:url('7')+'?problemSetProblemId='+id,text:id}));
assert.equal(progress().current,2);assert.equal(progress().total,3);

let title='PTA | 程序设计类实验辅助教学平台', course='JAVA程序设计-第6章题集-常用工具类的使用（2026-2027-1）';
const languageContext={state:{language:'auto'},LANG_NAMES:{java:'Java',c:'C',cpp:'C++',python:'Python',pascal:'Pascal'},document:{get title(){return title}},location:{href:url('2')},queryAll:selector=>selector==='a[href*="/exam/overview"]'?[{text:course}]:[],textOf:el=>el.text};
const language=vm.runInNewContext(section('    function detectLanguage(', '    function extractOptions')+'({detectLanguage,resolveLanguage,languageLabel})',languageContext);
assert.equal(language.detectLanguage(''),'java');
assert.equal(language.languageLabel('auto'),'Java');
assert.equal(language.resolveLanguage('', 'cpp'),'cpp'); // Explicit selection wins.
assert.equal(language.detectLanguage('#include <stdio.h>\nint main() {printf("x");}'),'c'); // Actual code wins over the course title.
assert.equal(language.detectLanguage('std::cout << 1;'),'cpp');
course='JavaScript 程序设计';assert.equal(language.detectLanguage(''),'c'); // Do not mistake JavaScript for Java.
course='';title='JAVA程序设计';assert.equal(language.detectLanguage(''),'java');
title='PTA';course='Python程序设计';assert.equal(language.detectLanguage(''),'python');
course='C++程序设计';assert.equal(language.detectLanguage(''),'cpp');
course='';assert.equal(language.detectLanguage('System.out.println(1);'),'java');
assert.equal(language.detectLanguage(''),'c');
// Prompt generation should use question/code evidence, not only a blank string.
Object.assign(languageContext,language);
// Extract just promptFor (ends before the following function).
const begin=source.indexOf('    function promptFor('),end=source.indexOf('\n    function ',begin+10);
languageContext.modelSupportsVision=()=>false;
const prompt = vm.runInNewContext(source.slice(begin,end)+'promptFor',languageContext);
const result=prompt('choice',{language:'auto',description:'System.out.println(1);'},false);
assert.match(typeof result==='string'?result:JSON.stringify(result),/Java/);
console.log('PASS: per-type progress and automatic/manual language selection');
