const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const start=source.indexOf('    // BEGIN bundled KaTeX'),end=source.indexOf('    // Answer assistance is opt-in',start);
const code=source.slice(start,end);
// Minimal DOM fixture; no HTML execution and no external test dependency.
class Node {
 constructor(name='',text='',type=1){this.localName=name;this.nodeType=type;this._text=text;this.childNodes=[];this.attrs={};}
 appendChild(n){this.childNodes.push(n);return n;}
 setAttribute(k,v){this.attrs[k]=String(v);}
 get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}));}
 get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
 set textContent(v){this._text=String(v);this.childNodes=[];}
 querySelector(tag){return this.childNodes.find(n=>n.localName===tag)||this.childNodes.map(n=>n.querySelector(tag)).find(Boolean)||null;}
}
const document={createElement:n=>new Node(n),createElementNS:(ns,n)=>new Node(n),createTextNode:t=>new Node('',t,3)};
class Parser {
 parseFromString(html){
  const root=new Node('root'),stack=[root];
  for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
   if(token.startsWith('</')){stack.pop();continue;}
   if(token.startsWith('<')){const name=token.match(/^<([\w-]+)/)[1],node=new Node(name);for(const a of token.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(a[1],a[2]);stack.at(-1).appendChild(node);if(!token.endsWith('/>'))stack.push(node);}
   else stack.at(-1).appendChild(document.createTextNode(token));
  } return root;
 }
}
const ctx={document,DOMParser:Parser};vm.createContext(ctx);vm.runInContext(code,ctx);
function all(node,name){return (node.localName===name?[node]:[]).concat(...node.childNodes.map(n=>all(n,name)));}
const sample=String.raw`### 条件与方法

取 \(n_0\) 为初值，**检查边界**。

\[
S_n=\frac{n(n+1)}{2}
\]

- 第一步
- 第二步

`;
let out=ctx.renderAssistance(sample);
assert.equal(all(out,'h3').length,1);assert.equal(all(out,'strong').length,1);assert.equal(all(out,'li').length,2);
assert.equal(all(out,'math').length,2);assert.equal(all(out,'msub').length>=1,true);assert.equal(all(out,'mfrac').length,1);
assert.equal(all(out,'math')[1].attrs.display,'block');
out=ctx.renderAssistance(String.raw`内联 \\(n_0\\)，块：
\\[\\frac{1}{2}\\]`);
assert.equal(all(out,'math').length,2);assert.equal(all(out,'mfrac').length,1);
out=ctx.renderAssistance('```java\n<script>alert(1)</script>\n```\n\n`$x$` 与 $x^2$');
assert.equal(all(out,'pre').length,1);assert.equal(all(out,'script').length,0);assert.equal(all(out,'math').length,1);
const hostile=String.raw`<img src=x onerror=alert(1)><script>alert(1)</script>

[click](javascript:alert(1)) ![tracker](https://evil.test/collect)

\(\href{javascript:alert(1)}{x}\) \(\includegraphics{https://evil.test/a}\)`;
out=ctx.renderAssistance(hostile);for(const tag of ['script','img','iframe','a'])assert.equal(all(out,tag).length,0);
for(const n of all(out,'math')){assert.ok(!JSON.stringify(n).includes('"href"'));}
// Sanitization still applies even if a renderer returns unwanted elements/attributes.
const original=ctx.assistanceKatex;ctx.assistanceKatex={renderToString:()=>'<math onclick="bad()"><mrow><img src="x"/><mi href="javascript:bad()" style="background:url(x)">x</mi></mrow></math>'};
out=ctx.assistanceMath('x',false,false);assert.equal(out.attrs.onclick,undefined);assert.equal(all(out,'img').length,0);assert.equal(all(out,'mi')[0].attrs.href,undefined);
ctx.assistanceKatex=original;
out=ctx.renderAssistance(String.raw`错误 \(\unknowncommand{x}\)`);assert.equal(all(out,'math').length,0);assert.match(out.textContent,/unknowncommand/);
ctx.assistanceKatex=null;out=ctx.renderAssistance(String.raw`### 无依赖

\(x^2\)`);assert.equal(all(out,'h3').length,1);assert.match(out.textContent,/x\^2/);
ctx.assistanceKatex=original;assert.equal(ctx.assistanceNormalizeText(JSON.stringify('### 标题\n\n\\(x\\)')),'### 标题\n\n\\(x\\)');
assert.ok(!/(?:^|[^.\w])fetch\(|XMLHttpRequest|GM_xmlhttpRequest/.test(code.slice(code.indexOf('// Safe local Markdown'))));
console.log('PASS safe Markdown / bundled KaTeX MathML, double escaping, code literals, hostile HTML/URLs, sanitizer, fallback');
