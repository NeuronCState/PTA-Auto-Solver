const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('PTA Auto Solver Pro-1.8.1-beta.1.user.js','utf8');
const part=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const elements={'pta-platform-label':{},'pta-platform-link':{}};
const ctx={state:{provider:'deepseek',configs:{deepseek:{},mimo:{apiKey:''},opencode_zen:{},opencode:{}}},localRuntime:{baseUrl:'http://127.0.0.1:8788/v1'},document:{getElementById:id=>elements[id]}};
const api=vm.runInNewContext(part('    var PROVIDERS =','    var LANG_NAMES')+part('    function baseUrl(','    function authHeaders(')+part('    function syncProviderPlatform()','    function syncConcurrencyUI()')+'({syncProviderPlatform,endpoint,modelsEndpoint})',ctx);
const expected={deepseek:['https://platform.deepseek.com','https://api.deepseek.com/v1'],mimo:['https://platform.xiaomimimo.com/console','https://api.xiaomimimo.com/v1'],opencode_zen:['https://opencode.ai/console/models','https://opencode.ai/zen/v1'],opencode:['https://opencode.ai/docs/','http://127.0.0.1:8788/v1']};
for(const [provider,[url,base]]of Object.entries(expected)){
 ctx.state.provider=provider;api.syncProviderPlatform();const link=elements['pta-platform-link'];assert.equal(link.href,url);assert.equal(link.textContent,url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.equal(link.referrerPolicy,'no-referrer');assert.equal(elements['pta-platform-label'].textContent,provider==='opencode'?'官方文档':provider==='mimo'?'控制台':'开放平台');assert.equal(api.endpoint(provider),base+'/chat/completions');assert.equal(api.modelsEndpoint(provider),base+'/models');
}
ctx.state.configs.mimo.apiKey='tp-test';assert.equal(api.endpoint('mimo'),'https://token-plan-cn.xiaomimimo.com/v1/chat/completions');
ctx.localRuntime.baseUrl='http://127.0.0.1:9999/v1';assert.equal(api.endpoint('opencode'),'http://127.0.0.1:9999/v1/chat/completions');
assert.match(src,/<a id="pta-platform-link"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
assert.ok(!src.includes('id="pta-endpoint"'));assert.match(part('    function syncUI()','    function bindUI('),/syncProviderPlatform\(\)/);
console.log('PASS: provider platform links, safe new-tab attributes, all chat/model endpoints unchanged');
