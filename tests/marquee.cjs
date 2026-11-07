'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(process.env.PTA_SCRIPT || 'PTA Auto Solver Pro-1.8.1-beta.1.user.js', 'utf8');
const css = source.match(/var CSS = `([\s\S]*?)`;/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector) {
  const declarations = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].trim().split(',').map(x => x.trim()).includes(selector)) declarations.push(match[2]);
  }
  return Object.fromEntries(declarations.flatMap(x => x.split(';')).filter(Boolean).map(x => {
    const index = x.indexOf(':'); return [x.slice(0, index).trim(), x.slice(index + 1).trim()];
  }));
}
const aura = rule('.pta-aura');
assert.equal(aura.width, '58px');
assert.equal(aura.height, '58px');
assert.equal(aura.right, '0');
assert.equal(aura.bottom, '0');
assert.equal(aura.left, undefined);
assert.equal(aura.top, undefined);
assert.equal(aura.visibility, 'hidden');
assert.equal(aura.opacity, '0');
assert.equal(aura.transition, 'none', 'expanding/stopping must hide immediately, without a moving fade-out');
const active = rule('#pta-shell.collapsed.running + .pta-aura');
assert.equal(active.visibility, 'visible');
assert.equal(active.opacity, '1');
assert.match(active.transition, /visibility 0s linear \.72s/, 'show only after collapse settles');
assert.deepEqual(active, rule('#pta-root.running #pta-shell.collapsed + .pta-aura'));
for (const part of ['.pta-aura-disc', '.pta-aura-ambient']) {
  const style = rule(part);
  assert.equal(style.left, '50%');
  assert.equal(style.top, '50%');
  assert.equal(parseFloat(style['margin-left']), -parseFloat(style.width) / 2);
  assert.equal(parseFloat(style['margin-top']), -parseFloat(style.height) / 2);
}
assert.equal(rule('#pta-shell.collapsed').background, '#fff');
assert.equal(rule('#pta-shell.collapsed')['backdrop-filter'], 'none');
assert.equal(rule('html.pta-theme-dark #pta-shell.collapsed').background, '#18181a');
assert.doesNotMatch(css, /pta-letter-wave|pta-pas-shimmer|background-clip:text|-webkit-text-fill-color:transparent/, 'PAS must not use clipped text with independently transformed letters');
assert.match(rule('.pta-aura-disc').animation, /pta-orb-spin/, 'retain the colorful outer animation');
console.log('Marquee CSS regression checks passed (static, not a browser rendering test)');
