// ==UserScript==
// @name         PTA Auto Solver v52
// @namespace    http://tampermonkey.net/
// @version      52
// @description  PTA 自动解题（支持填空/判断/单选/程序填空/函数/编程题）- 自动读取PTA页面语言选择器，支持 DeepSeek API
// @author       NeuronCState
// @match        https://pintia.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      localhost
// @connect      api.deepseek.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    console.log('[PTA-Auto] vv52 ' + new Date().toLocaleTimeString());

    // ========== 配置 ==========
    var API_BASE = 'http://localhost:18765';

    // DeepSeek 设置（panel 创建时会重新从 localStorage 初始化）
    var _ptaDsSettings = JSON.parse(localStorage.getItem('_ptaDsSettings') || 'null') || {
        provider: 'ollama',
        apiKey: '',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com'
    };

    // ========== 题型 → system prompt 映射表 ==========
    var SYS_PROMPTS = {
        judge:          '你是一个严谨的判断题答题专家。严格遵守输出格式，不得有任何额外文字。\n输出格式：只输出 true 或 false，其他任何字符都不允许输出。',
        choice:         '你是一个严谨的单选题答题专家。严格遵守输出格式，不得有任何额外文字。\n输出格式：只输出正确选项的字母（如 A 或 B），不得输出解释、不得输出空格、不得输出换行、不得有任何其他字符。',
        multi_choice:   '你是一个严谨的多选题答题专家。严格遵守输出格式，不得有任何额外文字。\n输出格式：只输出所有正确选项的字母拼接（如 AB 或 ACD），不得输出解释、不得输出空格、不得输出分隔符、不得有任何其他字符。',
        fill:           '你是一个严谨的填空题答题专家。严格遵守输出格式，不得有任何额外文字。\n输出格式：只输出填空题的答案文本，不得输出引号、不得输出解释、不得输出代码块、不得输出任何其他字符。',
        'program-fill': '你是一个严谨的程序填空题答题专家。严格遵守输出格式，不得有任何额外文字。\n输出格式：严格按照【空的数量】输出答案，多个答案之间用英文竖线 | 分隔，答案内不得包含 | 字符。\n示例（假设3个空）：答案1|答案2|答案3\n禁止：解释、代码块、引号、前缀、后缀、空格、换行等任何额外内容。',
        function:       null, // 动态构建
        programming:    null  // 动态构建
    };

    var LANG_NAMES = { cpp: 'C++', python: 'Python', c: 'C', java: 'Java' };

    // ========== 工具函数 ==========

    // 穿透 shadow DOM 查找所有匹配元素
    function queryDeepAll(selector) {
        var results = [];
        try {
            try { results.push.apply(results, document.querySelectorAll(selector)); } catch (e) {}
            try {
                var allEls = document.querySelectorAll('*');
                for (var i = 0; i < allEls.length; i++) {
                    if (allEls[i].shadowRoot) {
                        try {
                            results.push.apply(results, allEls[i].shadowRoot.querySelectorAll(selector));
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        } catch (e) {}
        return results;
    }

    // 递归获取元素的纯文本（含 shadow DOM 穿透）
    function getDeepText(el) {
        if (!el) return '';
        var parts = [];
        var child = el.firstChild;
        while (child) {
            if (child.nodeType === 3) {
                parts.push(child.textContent || '');
            } else if (child.nodeType === 1) {
                if (child.shadowRoot) {
                    parts.push(getDeepText(child.shadowRoot));
                } else {
                    parts.push(getDeepText(child));
                }
            }
            child = child.nextSibling;
        }
        return parts.join('');
    }

    // 获取元素的完整 innerText（穿透 shadow DOM）
    function getDeepInnerText(el) {
        if (!el) return '';
        var parts = [];
        for (var i = 0; i < el.childNodes.length; i++) {
            var node = el.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                parts.push(node.textContent || '');
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.shadowRoot) {
                    parts.push(getDeepInnerText(node.shadowRoot));
                } else if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
                    var style = window.getComputedStyle(node);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        parts.push(getDeepInnerText(node));
                        if (node.tagName === 'DIV' || node.tagName === 'SPAN' || node.tagName === 'P') {
                            parts.push('\n');
                        }
                    }
                }
            }
        }
        return parts.join('').replace(/\n{3,}/g, '\n\n');
    }

    // 统一封装的 fetch（返回 Promise）
    function api(path, opts) {
        opts = opts || {};
        return new Promise(function(resolve) {
            GM_xmlhttpRequest({
                method: opts.method || 'GET',
                url: API_BASE + path,
                headers: { 'Content-Type': 'application/json' },
                data: opts.body ? JSON.stringify(opts.body) : null,
                onload: function(resp) {
                    try {
                        var data = resp.responseText ? JSON.parse(resp.responseText) : null;
                        resolve({ ok: true, data: data, error: null });
                    } catch (e) {
                        resolve({ ok: false, data: null, error: 'JSON解析失败: ' + resp.responseText });
                    }
                },
                onerror: function(err) {
                    resolve({ ok: false, data: null, error: '网络错误: ' + (err.message || String(err)) });
                },
                ontimeout: function() {
                    resolve({ ok: false, data: null, error: '请求超时' });
                }
            });
        });
    }

    // DeepSeek 直连调用
    function callDeepSeekDirect(body, dsConfig) {
        return new Promise(function(resolve) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: (dsConfig.baseUrl || 'https://api.deepseek.com') + '/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + dsConfig.apiKey
                },
                data: JSON.stringify(body),
                timeout: 120000,
                onload: function(resp) {
                    try {
                        var data = JSON.parse(resp.responseText);
                        if (resp.status !== 200) {
                            var err = (data.error && data.error.message) || data.error || resp.responseText.slice(0, 200);
                            resolve({ ok: false, data: null, error: 'DeepSeek ' + resp.status + ': ' + err });
                        } else {
                            var raw = (data.choices || [{}])[0].message.content || '';
                            raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
                            resolve({ ok: true, data: { ready: true, answer: raw, error: '' }, error: null });
                        }
                    } catch (e) {
                        resolve({ ok: false, data: null, error: '响应解析失败: ' + resp.responseText.slice(0, 100) });
                    }
                },
                onerror: function(err) {
                    resolve({ ok: false, data: null, error: '网络错误: ' + (err.message || String(err)) });
                },
                ontimeout: function() {
                    resolve({ ok: false, data: null, error: 'DeepSeek 请求超时（>120s）' });
                }
            });
        });
    }

    // 等待 API 结果（通用轮询）
    function waitForResult(taskId) {
        return new Promise(function(resolve) {
            var attempts = 0;
            var timer = setInterval(function() {
                attempts++;
                if (attempts >= 120) {
                    clearInterval(timer);
                    resolve(null);
                    return;
                }
                api('/result/' + taskId).then(function(r) {
                    if (r.ok && r.data && r.data.ready) {
                        clearInterval(timer);
                        resolve(r.data);
                    }
                }).catch(function() {});
            }, 1000);
        });
    }

    // API 调用（带重试）
    function apiWithRetry(path, opts, maxRetries) {
        maxRetries = maxRetries || 2;
        return new Promise(function(resolve) {
            var retry = 0;
            function attempt() {
                api(path, opts).then(function(resp) {
                    if (resp.ok || retry >= maxRetries) {
                        resolve(resp);
                    } else {
                        retry++;
                        log('API 失败，重试中... (' + retry + '/' + maxRetries + ')');
                        setTimeout(attempt, 500 * retry);
                    }
                });
            }
            attempt();
        });
    }

    // ========== 题型检测 ==========
    function detectQuestionType() {
        var m = location.pathname.match(/\/exam\/problems\/type\/(\d+)/);
        if (m) {
            var t = { '1': 'judge', '2': 'choice', '3': 'multi_choice', '4': 'fill', '5': 'program_fill', '6': 'function', '7': 'programming' };
            return t[m[1]] || 'unknown';
        }
        return 'unknown';
    }

    function detectLanguageFromExamName() {
        var combined = (document.title || '') + ' ' + location.pathname + location.search;
        if (/\bpy\b/i.test(combined) || /python/i.test(combined)) return 'python';
        if (/c\+\+|cpp|objective-c/i.test(combined)) return 'cpp';
        if (/java(?!script)/i.test(combined)) return 'java';
        if (/pascal|delphi/i.test(combined)) return 'pascal';
        if (/c\s语言|c语言|c program/i.test(combined)) return 'c';
        return '';
    }

    function detectLanguage(code) {
        if (!code) return 'c';
        var lower = code.toLowerCase();
        if (/\binclude\s*<\s*stdio|\bint main\(|\bprintf\(|\bscanf\(|\bchar\s+\w+\[/.test(lower)) return 'c';
        if (/\bcout\s*<|<\s*iostream|\bcin\s*>>|\bstd::|\bnamespace\s+std/.test(lower)) return 'cpp';
        if (/\bdef\s+\w+\(|\bprint\s*\(|\bimport\s+\w+|\bif\s+__name__/.test(lower)) return 'python';
        return 'c';
    }

    // ========== 题目提取 ==========

    // 提取编程题的各部分信息
    function extractProgrammingQuestion(rmEl) {
        if (!rmEl) return { desc: '', input_spec: '', output_spec: '', sample_input: '', sample_output: '' };

        var savedH = rmEl.style.height, savedMH = rmEl.style.maxHeight, savedO = rmEl.style.overflow;
        rmEl.style.maxHeight = 'none';
        rmEl.style.overflow = 'visible';
        var fullText = (rmEl.innerText || rmEl.textContent || '');
        rmEl.style.height = savedH;
        rmEl.style.maxHeight = savedMH;
        rmEl.style.overflow = savedO;

        function cleanText(t) {
            return (t || '')
                .replace(/复制内容|格式|全屏|收起▾|收起/g, '')
                .replace(/\[?\s*C\+\+\s*\]?/g, '')
                .replace(/\n+/g, '\n')
                .trim();
        }

        var sampleInput = '', sampleOutput = '';
        var inputStart = fullText.indexOf('输入样例');
        if (inputStart >= 0) {
            var chunk = fullText.slice(inputStart + 4);
            var end = Math.min(
                chunk.indexOf('输出样例') >= 0 ? chunk.indexOf('输出样例') : Infinity,
                chunk.indexOf('输出:') >= 0 ? chunk.indexOf('输出:') : Infinity,
                chunk.indexOf('输出：') >= 0 ? chunk.indexOf('输出：') : Infinity,
                chunk.indexOf('【代码】') >= 0 ? chunk.indexOf('【代码】') : Infinity,
                2000
            );
            sampleInput = cleanText(chunk.slice(0, end));
        }
        var outputStart = fullText.indexOf('输出样例');
        if (outputStart >= 0) {
            var chunk = fullText.slice(outputStart + 4);
            var end = chunk.indexOf('【代码】');
            if (end < 0) end = Math.min(chunk.length, 2000);
            sampleOutput = cleanText(chunk.slice(0, end));
        }

        var kwList = ['输入样例', '输出样例', '【代码】'];
        var descEnd = fullText.length;
        for (var ki = 0; ki < kwList.length; ki++) {
            var pos = fullText.indexOf(kwList[ki]);
            if (pos >= 0 && pos < descEnd) descEnd = pos;
        }
        var descText = cleanText(fullText.slice(0, descEnd));

        return {
            desc: descText,
            input_spec: '',
            output_spec: '',
            sample_input: sampleInput,
            sample_output: sampleOutput
        };
    }

    // API 结果提取（兼容 code/answer/reasoning）
    function extractAnswer(result) {
        var raw = result.code || result.answer || '';
        if (!raw && result.reasoning) {
            raw = result.reasoning.replace(/```[\s\S]*?```/g, function(m) {
                return m.replace(/```[a-z]*\n?/g, '').trim();
            }).trim();
        }
        return raw;
    }

    // 获取 cm-editor 的代码文本
    function getCmEditorCode(cmEditor) {
        if (!cmEditor) return '';
        var codeEditorDiv = cmEditor.parentNode;
        if (!codeEditorDiv || !codeEditorDiv.className) return '';
        var cls = codeEditorDiv.className.toString ? codeEditorDiv.className.toString() : '';
        if (!cls.includes('codeEditor')) return '';

        var cmContent = codeEditorDiv.querySelector('.cm-content');
        if (!cmContent) return '';

        var savedHeight = cmContent.style.height;
        var savedMaxH = cmContent.style.maxHeight;
        var savedOverflow = cmContent.style.overflow;
        cmContent.style.height = 'auto';
        cmContent.style.maxHeight = 'none';
        cmContent.style.overflow = 'visible';

        var clone = cmContent.cloneNode(true);
        var blanks = clone.querySelectorAll ? clone.querySelectorAll('[id^="blank"], .cm-widgetBuffer input') : [];
        for (var bi = 0; bi < blanks.length; bi++) {
            var span = blanks[bi];
            var txt = span.value || span.getAttribute('data-content') || '';
            var repl = document.createTextNode(txt || '______');
            span.parentNode.replaceChild(repl, span);
        }
        var raw = (clone.innerText || '').trim();

        cmContent.style.height = savedHeight;
        cmContent.style.maxHeight = savedMaxH;
        cmContent.style.overflow = savedOverflow;

        // 提取代码：从第一行 C 代码开始
        var lines = raw.split('\n');
        var codeStartIdx = -1;
        for (var li = 0; li < lines.length; li++) {
            var l = lines[li].trim();
            if (/^下面|^以下|^请用|复制内容|格式|全屏|收起|^$/.test(l)) continue;
            if (/^(char|int|void|#include|struct|static|typedef|enum)/.test(l)) {
                codeStartIdx = li; break;
            }
        }
        if (codeStartIdx >= 0) {
            return lines.slice(codeStartIdx).join('\n').replace(/input\s$/, '').trim();
        }
        return raw;
    }

    // ========== CodeMirror 编辑器写入 ==========
    async function writeCodeToEditor(cmEditor, code) {
        if (!cmEditor || !code) return false;
        var cmContent = cmEditor.querySelector('.cm-content') || cmEditor;

        try { if (typeof GM_setClipboard !== 'undefined') GM_setClipboard(code); } catch (e) {}
        try { await navigator.clipboard.writeText(code); } catch (e) {}

        // 方式1：cmTile.view.dispatch
        try {
            var tile = cmContent.cmTile;
            if (tile && tile.view && tile.view.dispatch && tile.view.state) {
                tile.view.dispatch({
                    changes: { from: 0, to: tile.view.state.doc.length, insert: code },
                    selection: { anchor: code.length }
                });
                await new Promise(function(r) { setTimeout(r, 100); });
                if ((cmContent.innerText || '').trim().length > 0) return true;
            }
        } catch (e) {}

        // 方式2：遍历 DOM 找 _view
        try {
            var allEls = cmEditor.querySelectorAll ? cmEditor.querySelectorAll('*') : [];
            for (var vi = 0; vi < allEls.length; vi++) {
                var v = allEls[vi]._view || allEls[vi]._cmView || allEls[vi].__view;
                if (v && v.dispatch && v.state) {
                    v.dispatch({
                        changes: { from: 0, to: v.state.doc.length, insert: code },
                        selection: { anchor: code.length }
                    });
                    await new Promise(function(r) { setTimeout(r, 100); });
                    if ((cmContent.innerText || '').trim().length > 0) return true;
                }
            }
        } catch (e) {}

        // 方式3：CodeMirror 5
        try {
            var inst = cmEditor.CodeMirror || cmEditor.codeMirror ||
                       (cmContent.parentNode && cmContent.parentNode.CodeMirror);
            if (inst && typeof inst.setValue === 'function') {
                inst.setValue(code);
                if (inst.refresh) inst.refresh();
                await new Promise(function(r) { setTimeout(r, 100); });
                if ((cmContent.innerText || '').trim().length > 0) return true;
            }
        } catch (e) {}

        return false;
    }

    // ========== 描述获取 ==========

    // 预收集所有 .rendered-markdown 描述（带缓存）
    function collectAllDescriptions() {
        if (window._ptaDescCache) return window._ptaDescCache;
        var cache = [];
        var els = queryDeepAll('.rendered-markdown');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var txt = (el.innerText || el.textContent || '').split('▸')[0].trim();
            if (!txt || txt.length < 6) continue;
            txt = txt.replace(/\[?\s*C\+\+\s*\]?/g, '').replace(/复制内容|格式|全屏|收起/g, ' ').replace(/\s+/g, ' ').trim();
            if (!/本题要求|请填空|输入.*格式|输出.*格式|运行结果|输出结果|程序段|请用/i.test(txt)) continue;
            var r = el.getBoundingClientRect();
            cache.push({ el: el, txt: txt, bottom: r.bottom });
        }
        cache.sort(function(a, b) { return b.bottom - a.bottom; });
        window._ptaDescCache = cache;
        console.log('[PTA-DIAG] 预收集到 ' + cache.length + ' 个描述');
        return cache;
    }

    // 为指定 input 找到正确的题目描述
    function getDescriptionForInputNew(input) {
        var rm = input;
        while (rm && rm !== document.body) {
            if (rm.classList && rm.classList.contains('rendered-markdown')) break;
            rm = rm.parentNode;
        }
        if (rm && rm !== document.body) {
            var cleaned = '';
            var pEls = rm.querySelectorAll ? rm.querySelectorAll('P') : [];
            for (var pi = 0; pi < pEls.length; pi++) {
                var t = (pEls[pi].innerText || '').trim();
                if (t.length > 5) { cleaned = t; break; }
            }
            if (!cleaned) cleaned = (rm.innerText || '').trim();
            cleaned = cleaned.replace(/\[?\s*C\+\+\s*\]?/g, '').replace(/复制内容|格式|全屏|收起▾/g, ' ').replace(/\s+/g, ' ').trim();

            var codeText = '';
            var parentDiv = rm.parentNode;
            if (parentDiv) {
                var codeEditorDiv = parentDiv.querySelector('[class*="codeEditor"]');
                if (codeEditorDiv) {
                    var cmEditor = codeEditorDiv.querySelector('.cm-editor');
                    if (cmEditor) codeText = getCmEditorCode(cmEditor) || '';
                }
            }
            if (!codeText) {
                var ancestor = rm.parentNode;
                while (ancestor && ancestor !== document.body) {
                    var codeEditorDiv = ancestor.querySelector('[class*="codeEditor"]');
                    if (codeEditorDiv) {
                        var cmEditor = codeEditorDiv.querySelector('.cm-editor');
                        if (cmEditor) {
                            codeText = getCmEditorCode(cmEditor) || '';
                            if (codeText) break;
                        }
                    }
                    ancestor = ancestor.parentNode;
                }
            }
            if (codeText) return cleaned + '\n' + codeText;
            if (cleaned.length > 10) return cleaned;
        }
        // 备选：Y 坐标最近匹配
        var allDesc = collectAllDescriptions();
        if (!allDesc || allDesc.length === 0) return '';
        var inputRect = input.getBoundingClientRect();
        var inputMid = inputRect.top + inputRect.height / 2;
        var best = null, bestDist = Infinity;
        for (var di = 0; di < allDesc.length; di++) {
            var d = allDesc[di];
            var dRect = d.el.getBoundingClientRect();
            var dMid = dRect.top + dRect.height / 2;
            var dist = Math.abs(dMid - inputMid);
            if (dist < bestDist) {
                bestDist = dist;
                best = d.txt;
            }
        }
        return best || '';
    }

    // 程序填空题的描述获取（input 在 cm-editor 内）
    function getProgramFillDescription(input) {
        if (!input) return '';
        var cmEditor = null;
        var el = input;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('cm-editor')) { cmEditor = el; break; }
            el = el.parentNode;
        }
        if (!cmEditor) return '';
        var wrapperDiv = (cmEditor.parentNode && cmEditor.parentNode.parentNode) || null;
        if (!wrapperDiv) return '';
        var rmDiv = wrapperDiv.querySelector('[class*="rendered-markdown"]');
        if (rmDiv) {
            var pEls = rmDiv.querySelectorAll ? rmDiv.querySelectorAll('P') : [];
            for (var pi = 0; pi < pEls.length; pi++) {
                var t = (pEls[pi].innerText || '').trim();
                if (t.length > 5) {
                    return t.replace(/\[?\s*C\+\+\s*\]?/g, '').replace(/复制内容|格式|全屏|收起▾/g, ' ').replace(/\s+/g, ' ').trim();
                }
            }
        }
        return '';
    }

    // 获取 cm-editor 父链中最近的 .cm-editor
    function getInputCmEditor(input) {
        var el = input;
        while (el && el.tagName !== 'DIV') el = el.parentNode;
        while (el && !el.classList.contains('cm-editor')) el = el.parentNode;
        return el;
    }

    function getProblemDescription() {
        var el = document.querySelector('[class*="problem-title"], [class*="question-title"]');
        return el ? (el.innerText || '').slice(0, 200) : '';
    }

    // 清理题目描述中的 UI 干扰文字
    function cleanDescription(raw) {
        if (!raw) return '';
        return raw
            .replace(/复制内容|格式|全屏|收起/g, '')
            .replace(/^\s*\d+\s*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // 判断题/选择题专用：获取完整题目文字
    function getQuestionText(descEl) {
        descEl.scrollIntoView({ behavior: 'instant', block: 'start' });

        var mt4 = null;
        var el = descEl;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('mt-4')) { mt4 = el; break; }
            el = el.parentElement;
        }
        if (!mt4) mt4 = descEl;

        // 从 cm-editor 取代码（cmTile 不受 innerText 截断影响）
        var codeTexts = [];
        var cmEditors = mt4.querySelectorAll('.cm-editor');
        for (var ci = 0; ci < cmEditors.length; ci++) {
            var cm = cmEditors[ci];
            var cmContent = cm.querySelector('.cm-content');
            var tile = cmContent && cmContent.cmTile;
            if (tile && tile.view && tile.view.state && tile.view.state.doc) {
                var doc = tile.view.state.doc;
                var code = doc.sliceString(0, doc.length);
                if (code && code.trim().length > 5) {
                    codeTexts.push(code.trim());
                }
            }
        }

        // 描述：取 mt-4 innerText，截掉 T/F 选项
        var raw2 = mt4.innerText || '';
        var lastT = raw2.lastIndexOf('\nT\n');
        var lastF = raw2.lastIndexOf('\nF\n');
        var tfIdx = Math.max(lastT, lastF);
        if (tfIdx > 5) raw2 = raw2.slice(0, tfIdx);
        raw2 = cleanDescription(raw2);

        var parts = [];
        for (var ci = 0; ci < codeTexts.length; ci++) {
            parts.push('【代码' + (codeTexts.length > 1 ? (ci + 1) : '') + '】\n' + codeTexts[ci]);
        }
        if (raw2) parts.push('【描述】\n' + raw2);
        return parts.join('\n\n');
    }

    // 获取程序填空输入框列表
    function getProgramFillInputs() {
        return document.querySelectorAll('.cm-widgetBuffer + span input');
    }

    // ========== UI 辅助 ==========

    function log(msg) {
        var el = document.getElementById('pta-auto-log');
        if (el) {
            var div = document.createElement('div');
            div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
            el.appendChild(div);
            el.scrollTop = el.scrollHeight;
        }
        console.log('[PTA-Auto] ' + msg);
    }

    function showCurrent(text, current, total) {
        var el = document.getElementById('q-current');
        if (el) el.textContent = text + ' (' + current + '/' + total + ')';
    }

    // ========== 页面交互 ==========

    function clickNextButton() {
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            if ((btns[i].innerText || '').trim() === '下一题' && !btns[i].disabled) {
                btns[i].click();
                return true;
            }
        }
        return false;
    }

    function isNextButtonDisabled() {
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            if ((btns[i].innerText || '').trim() === '下一题') {
                return btns[i].disabled;
            }
        }
        return true;
    }

    async function waitForResultModal(maxMs) {
        var start = Date.now();
        while (Date.now() - start < maxMs) {
            var modal = document.querySelector('[class*="modal_"]');
            if (modal) return true;
            await new Promise(function(r) { setTimeout(r, 500); });
        }
        return false;
    }

    function closeResultModal() {
        var modal = document.querySelector('[class*="modal_"]');
        if (!modal) return false;
        var btn = modal.querySelector('button');
        if (btn) { btn.click(); return true; }
        return false;
    }

    // ========== 统一的题目提交接口 ==========
    async function submitQuestion(payload) {
        var ds = _ptaDsSettings;
        if (ds.provider === 'deepseek' && ds.apiKey) {
            var qType = payload.questionType;
            var langName = LANG_NAMES[payload.language] || 'C';

            // system prompt
            var sysContent = SYS_PROMPTS[qType];
            if (qType === 'function') {
                sysContent = '你是一个专业的 ' + langName + ' 函数实现专家。严格遵守以下输出要求：\n1. 只输出 ' + langName + ' 函数代码，不要包含 main 函数\n2. 不要输出 markdown 代码块标记（如 ```cpp ```）\n3. 不要输出任何解释、注释或额外文字\n4. 只输出纯代码';
            } else if (qType === 'programming') {
                sysContent = '你是一个专业的 ' + langName + ' 编程专家。严格遵守以下输出要求：\n1. 只输出完整的可运行的 ' + langName + ' 程序代码\n2. 不要输出 markdown 代码块标记（如 ```cpp ```）\n3. 不要输出任何解释、注释或额外文字\n4. 只输出纯代码';
            } else if (!sysContent) {
                sysContent = '你是一个编程专家。直接输出答案，不要解释。';
            }

            // user prompt
            var desc = payload.description || '';
            var userContent = '';

            if (qType === 'judge') {
                userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请判断以上说法是否正确，只输出 true 或 false。';
            } else if (qType === 'choice') {
                userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请选出正确答案，只输出选项字母。';
            } else if (qType === 'multi_choice') {
                userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请选出所有正确答案，只输出选项字母（如 AB）。';
            } else if (qType === 'fill') {
                userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请直接输出填空答案，不要任何解释。';
            } else if (qType === 'program-fill' || qType === 'program-fill-batch') {
                var blankCount = payload.blankCount || 1;
                userContent = '【编程语言】' + langName + '\n【题目描述】\n' + desc + '\n\n【待填写的代码（空用【空N】标记）】\n' + (payload.code || '') + '\n\n【重要】共 ' + blankCount + ' 个空需要填写。\n【输出要求】严格按顺序输出 ' + blankCount + ' 个答案，用英文竖线 | 分隔，不要包含任何其他字符。\n【示例】如果答案是 "foo"、"bar"、"123"，则输出：\nfoo|bar|123\n【注意】每个答案直接写内容即可，不要加引号、不要加解释、不要换行、不要空格，只用 | 连接。';
            } else if (qType === 'function') {
                userContent = '【编程语言】' + langName + '\n【题目描述】\n' + desc + '\n\n【代码框架】\n' + (payload.code || '') + '\n\n【输出要求】严格只输出函数的完整实现代码。\n1. 只输出函数体本身，不要包含 main 函数\n2. 不要输出任何解释、注释或 markdown 代码块标记\n3. 直接输出纯代码';
            } else if (qType === 'programming') {
                userContent = '【编程语言】' + langName + '\n【题目描述】\n' + desc;
                if (payload.input_spec)  userContent += '\n\n【输入格式】\n' + payload.input_spec;
                if (payload.output_spec) userContent += '\n\n【输出格式】\n' + payload.output_spec;
                if (payload.sample_input)  userContent += '\n\n【样例输入】\n' + payload.sample_input;
                if (payload.sample_output) userContent += '\n\n【样例输出】\n' + payload.sample_output;
                userContent += '\n\n【输出要求】严格只输出完整可运行的 ' + langName + ' 程序代码。\n1. 不要输出任何解释、注释或 markdown 代码块标记\n2. 直接输出纯代码';
                if (langName === 'Java') userContent += '\n3. 主类名必须为 Main';
                userContent += '\n4. 代码必须能够直接编译运行';
            } else {
                userContent = '【编程语言】' + langName + '\n' + desc;
            }

            return await callDeepSeekDirect({
                model: ds.model || 'deepseek-chat',
                messages: [
                    { role: 'system', content: sysContent },
                    { role: 'user', content: userContent }
                ],
                temperature: 0.0,
                max_tokens: 2048
            }, ds);
        } else {
            return await api('/submit', { method: 'POST', body: payload });
        }
    }

    // ========== 答题函数 ==========

    // 通用答案写入（填空题）
    function writeFillAnswer(input, answer) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        ns.call(input, answer);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 通用答案写入（判断/选择题选项）
    function writeChoiceAnswer(questionEl, answer) {
        var options = questionEl.querySelectorAll('li, [class*="option"], [class*="choice"]');
        if (options.length === 0) options = questionEl.querySelectorAll('label');

        // T/F 判断
        if (options.length === 2) {
            var optTexts = [options[0].textContent.trim(), options[1].textContent.trim()];
            var isJudge = /^[TF]$/i.test(optTexts[0]) && /^[TF]$/i.test(optTexts[1]);
            if (isJudge) {
                var lowerAns = (answer || '').toLowerCase().trim();
                var isTrue  = /^(true|正确|对|✓|yes|correct|right)$/i.test(lowerAns);
                var isFalse = /^(false|错误|错|✗|no|wrong|incorrect)$/i.test(lowerAns);
                var tOpt = null, fOpt = null, tInp = null, fInp = null;
                for (var oi = 0; oi < options.length; oi++) {
                    var firstChar = (options[oi].textContent || '').trim()[0];
                    if (/^T$/i.test(firstChar)) { tOpt = options[oi]; tInp = tOpt.querySelector ? tOpt.querySelector('input') : tOpt; }
                    if (/^F$/i.test(firstChar)) { fOpt = options[oi]; fInp = fOpt.querySelector ? fOpt.querySelector('input') : fOpt; }
                }
                if (isTrue  && tInp && (tInp.type === 'radio' || tInp.type === 'checkbox')) { tInp.click(); return true; }
                if (isFalse && fInp && (fInp.type === 'radio' || fInp.type === 'checkbox')) { fInp.click(); return true; }
            }
        }

        // 通用首字母匹配
        var lowerAnswer = answer.toLowerCase();
        for (var i = 0; i < options.length; i++) {
            var optText = options[i].textContent || '';
            var firstChar = optText.trim()[0];
            if (firstChar && lowerAnswer.includes(firstChar.toLowerCase())) {
                var inp = options[i].querySelector ? options[i].querySelector('input[type="radio"], input[type="checkbox"]') : null;
                if (!inp) inp = options[i];
                if (inp && (inp.type === 'radio' || inp.type === 'checkbox')) {
                    inp.click();
                    return true;
                }
            }
        }
        return false;
    }

    // ========== 填空题（普通 + 程序填空混合）============
    async function solveFillBatch() {
        if (!window._ptaRunning) return;
        var totalAnswered = 0;
        var maxRounds = 200;
        var round = 0;

        do {
            round++;
            if (round > maxRounds) { log('超过最大轮次，停止'); break; }

            await new Promise(function(r) { setTimeout(r, 1500); });

            var allInputs = queryDeepAll('input');
            var regularInputs = [];
            var programInputs = [];

            for (var hi = 0; hi < allInputs.length; hi++) {
                var t = (allInputs[hi].type || '').toLowerCase();
                if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'radio' || t === 'checkbox' || t === 'file' || t === 'password' || t === 'image') continue;
                var el = allInputs[hi];
                var isProgram = false;
                for (var pi = 0; pi < 10 && el; pi++) {
                    if (el.classList && (el.classList.contains('cm-line') || el.classList.contains('cm-content') || el.classList.contains('cm-editor'))) {
                        isProgram = true; break;
                    }
                    el = el.parentNode;
                }
                if (isProgram) programInputs.push(allInputs[hi]);
                else regularInputs.push(allInputs[hi]);
            }

            if (regularInputs.length === 0 && programInputs.length === 0) {
                if (round > 1 || totalAnswered > 0) {
                    log('本页无填空题，答题结束');
                    break;
                }
                log('未找到填空题输入框');
                if (window._ptaContinuous && !isNextButtonDisabled()) {
                    clickNextButton();
                    continue;
                }
                return 0;
            }

            log('=== 第' + round + '页：普通填空 ' + regularInputs.length + ' | 程序填空 ' + programInputs.length + ' ===');

            var answered = 0;

            // 普通填空题
            for (var i = 0; i < regularInputs.length; i++) {
                if (regularInputs[i].value && regularInputs[i].value.trim()) { answered++; continue; }
                showCurrent('填空 ' + (i+1), i+1, regularInputs.length);
                log('(' + (i+1) + '/' + regularInputs.length + ') 普通填空...');
                regularInputs[i].scrollIntoView({ behavior: 'instant', block: 'center' });
                window._ptaDescCache = null;
                await new Promise(function(r) { setTimeout(r, 300); });

                var description = getDescriptionForInputNew(regularInputs[i]) || '填空题';
                console.log('[PTA-DEBUG] fill desc[' + i + ']:\n' + description.slice(0, 500) + '\n[END]');

                var resp = await submitQuestion({
                    questionType: 'fill',
                    description: description,
                    model: window._ptaModelDefault,
                    language: window._ptaLang || 'c'
                });
                if (resp.error) { log('API错误: ' + resp.error); continue; }

                var result = resp.data;
                if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
                if (result && result.ready) {
                    var answer = (extractAnswer(result) || '').trim();
                    if (answer) {
                        writeFillAnswer(regularInputs[i], answer);
                        log('✓ ' + (i+1) + ': ' + answer.slice(0, 40));
                        answered++;
                    } else { log('空答案'); }
                } else { log('未获得结果'); }
                if (i < regularInputs.length - 1) await new Promise(function(r) { setTimeout(r, 300); });
            }

            // 程序填空题
            if (programInputs.length > 0) {
                log('开始处理 ' + programInputs.length + ' 个程序填空...');
                answered += await solveProgramFillBatchByInputs(programInputs);
            }

            totalAnswered += answered;

            if (window._ptaContinuous && !isNextButtonDisabled()) {
                clickNextButton();
            } else {
                break;
            }
        } while (true);

        return totalAnswered;
    }

    // 用指定的 input 列表处理程序填空
    async function solveProgramFillBatchByInputs(inputs) {
        if (!window._ptaRunning) return;
        var answered = 0;

        for (var i = 0; i < inputs.length; i++) {
            if (inputs[i].value && inputs[i].value.trim()) { answered++; continue; }
            showCurrent('程序填空 ' + (i+1), i+1, inputs.length);
            log('(' + (i+1) + '/' + inputs.length + ') 程序填空...');

            var cmEditor = getInputCmEditor(inputs[i]);
            var fullCode = getCmEditorCode(cmEditor) || '';
            var cmInputs = cmEditor ? (cmEditor.querySelectorAll ? cmEditor.querySelectorAll('.cm-widgetBuffer + span input') : []) : [];
            var blankIdx = 0;
            for (var bi = 0; bi < cmInputs.length; bi++) {
                if (cmInputs[bi] === inputs[i]) { blankIdx = bi; break; }
            }
            var blanksInQuestion = cmInputs.length;
            var parts = (fullCode || '______').split('______');
            var numberedParts = [];
            for (var pi = 0; pi < parts.length; pi++) {
                if (pi > 0) numberedParts.push('【空' + pi + '】');
                numberedParts.push(parts[pi]);
            }
            var codeForOne = numberedParts.join('').trim();
            var editorDesc = getDescriptionForInputNew(inputs[i]) || getProgramFillDescription(inputs[i]) || getProblemDescription();
            var lang = window._ptaLang || detectLanguage(fullCode) || 'c';

            var resp = await submitQuestion({
                questionType: 'program-fill',
                description: editorDesc,
                code: codeForOne,
                blankCount: blanksInQuestion,
                language: lang,
                blankIndex: blankIdx
            });
            if (resp.error) { log('API错误: ' + resp.error); }
            else {
                var result = resp.data;
                if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
                if (result && result.ready) {
                    var answerText = (extractAnswer(result) || '').trim();
                    var answers = answerText.split('|').map(function(s) { return s.trim(); });
                    var ans = answers[blankIdx] || answers[0] || '';
                    ans = ans.replace(/\u2260/g, '!=').replace(/\u003c\u003e/g, '!=').replace(/[≠⋠⩲]/g, '!=').trim();
                    if (ans) {
                        writeFillAnswer(inputs[i], ans);
                        log('✓ ' + (i+1) + '[' + blankIdx + ']: ' + ans.slice(0, 40));
                        answered++;
                    } else { log('空' + (i+1) + '[' + blankIdx + ']: 无答案'); }
                } else { log('等待超时'); }
            }
            if (i < inputs.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
        }
        return answered;
    }

    // ========== 判断题 ==========
    async function solveJudgeBatch() {
        if (!window._ptaRunning) return;
        var totalAnswered = 0;
        var pageRound = 0;
        var maxPage = 200;

        do {
            pageRound++;
            if (pageRound > maxPage) { log('超过最大页数，停止'); break; }

            await new Promise(function(r) { setTimeout(r, 1500); });

            var answered = 0;
            var total = 0;
            var seen = new Set();
            var allRadios = document.querySelectorAll('input[type="radio"]');
            for (var ri = 0; ri < allRadios.length; ri++) {
                if (!seen.has(allRadios[ri].name)) seen.add(allRadios[ri].name);
            }
            total = seen.size;
            seen.clear();

            if (total === 0) {
                if (totalAnswered > 0 || pageRound > 1) {
                    log('本页无判断题，答题结束');
                    break;
                }
                log('未找到判断题');
                if (window._ptaContinuous && !isNextButtonDisabled()) {
                    clickNextButton();
                    continue;
                }
                return 0;
            }
            log('=== 第' + pageRound + '页：' + total + ' 道判断题 ===');

            var maxIter = total * 2;
            for (var iter = 0; iter < maxIter; iter++) {
                var nextRadio = null;
                var nextDescEl = null;
                var nextName = null;
                for (var i = 0; i < allRadios.length; i++) {
                    var inp = allRadios[i];
                    if (seen.has(inp.name)) continue;
                    if (!window._ptaSkipAnswered || !inp.checked) {
                        nextRadio = inp;
                        nextName = inp.name;
                        var el = inp;
                        while (el && el !== document.body) {
                            if (el.classList && el.classList.contains('space-y-4') && (el.innerText || '').length > 10) {
                                nextDescEl = el; break;
                            }
                            el = el.parentElement;
                        }
                        if (!nextDescEl) nextDescEl = inp.closest('section, div[class]') || document.body;
                        nextDescEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                        break;
                    }
                }

                if (!nextRadio) { log('本页判断题已处理完毕'); break; }
                seen.add(nextName);

                await new Promise(function(r) { setTimeout(r, 600); });

                var qText = getQuestionText(nextDescEl).slice(0, 8000);
                var qNum = seen.size;
                showCurrent('判断 ' + qNum, qNum, total);
                log('(' + qNum + '/' + total + ') 题目:' + qText.slice(0, 120) + (qText.length > 120 ? '...' : ''));

                if (qText.length < 5 || qText.includes('1-1分数')) {
                    log('题' + qNum + ' 内容为空或列表页，跳过');
                    continue;
                }

                var resp = await submitQuestion({
                    questionType: 'judge',
                    description: qText,
                    _think: window._ptaThink
                });
                if (resp.error) { log('API 错误：' + resp.error); continue; }

                var result = resp.data;
                if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
                if (result && result.ready) {
                    var answer = (extractAnswer(result) || '').trim();
                    var targetLabel = null;
                    var answerPattern = '';
                    if (/正确|true|\u2713|yes/i.test(answer)) {
                        answerPattern = '正确';
                        var all = nextDescEl.querySelectorAll('label');
                        for (var l = 0; l < all.length; l++) {
                            if (/正确|\u2713|T/.test(all[l].textContent)) { targetLabel = all[l]; break; }
                        }
                    } else if (/错误|false|\u2717|no/i.test(answer)) {
                        answerPattern = '错误';
                        var all = nextDescEl.querySelectorAll('label');
                        for (var l = 0; l < all.length; l++) {
                            if (/错误|\u2717|F/.test(all[l].textContent)) { targetLabel = all[l]; break; }
                        }
                    }
                    if (targetLabel) {
                        var ri = targetLabel.querySelector('input[type="radio"]');
                        if (ri) {
                            ri.click();
                            ri.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                            log('\u2713 ' + qNum + ' [' + answerPattern + '] ' + answer.slice(0, 20));
                            answered++;
                        } else {
                            log('\u2717 ' + qNum + ' radio未找到');
                        }
                    } else {
                        log('\u2717 ' + qNum + ' 未找到选项 [' + answerPattern + '] answer=' + answer.slice(0, 20));
                    }
                }
                await new Promise(function(r) { setTimeout(r, 400); });
            }

            totalAnswered += answered;

            if (window._ptaContinuous && !isNextButtonDisabled()) {
                clickNextButton();
            } else {
                break;
            }
        } while (true);

        return totalAnswered;
    }

    // ========== 单选/多选题 ==========
    async function solveChoiceBatch(isMulti) {
        if (!window._ptaRunning) return;
        var totalAnswered = 0;
        var pageRound = 0;
        var maxPage = 200;

        do {
            pageRound++;
            if (pageRound > maxPage) { log('超过最大页数，停止'); break; }
            await new Promise(function(r) { setTimeout(r, 1500); });
            if (!window._ptaRunning) break;

            var seen = new Set();
            var allRadios = document.querySelectorAll('input[type="radio"]');
            var qNum = 0;
            var maxIter = allRadios.length * 2;

            for (var iter = 0; iter < maxIter; iter++) {
                if (!window._ptaRunning) break;
                var nextRadio = null;
                var nextDescEl = null;
                var nextName = null;
                for (var i = 0; i < allRadios.length; i++) {
                    var inp = allRadios[i];
                    if (seen.has(inp.name)) continue;
                    if (!window._ptaSkipAnswered || !inp.checked) {
                        nextRadio = inp;
                        nextName = inp.name;
                        var el = inp;
                        while (el && el !== document.body) {
                            if (el.classList && el.classList.contains('space-y-4') && (el.innerText || '').length > 10) {
                                nextDescEl = el; break;
                            }
                            el = el.parentElement;
                        }
                        if (!nextDescEl) nextDescEl = inp.closest('section, div[class]') || document.body;
                        nextDescEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                        break;
                    }
                }

                if (!nextRadio) { log('本页' + (isMulti ? '多选' : '单选') + '题已处理完毕'); break; }
                seen.add(nextName);

                await new Promise(function(r) { setTimeout(r, 600); });
                if (!window._ptaRunning) break;

                var qText = getQuestionText(nextDescEl).slice(0, 3000);
                qNum = seen.size;

                showCurrent((isMulti ? '多选' : '单选') + ' ' + qNum, qNum, seen.size);
                log('(' + qNum + '/' + seen.size + ') 题目:' + qText.slice(0, 120));

                if (qText.length < 5 || qText.includes('1-1分数')) {
                    log('题' + qNum + ' 内容为空或列表页，跳过');
                    continue;
                }

                var resp = await submitQuestion({
                    questionType: isMulti ? 'multi_choice' : 'choice',
                    description: qText
                });
                if (resp.error) { log('API 错误：' + resp.error); continue; }

                var result = resp.data;
                if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
                if (!window._ptaRunning) break;
                if (result && result.ready) {
                    var answer = (extractAnswer(result) || '').trim();
                    if (writeChoiceAnswer(nextDescEl, answer)) {
                        log('\u2713 ' + qNum + ': ' + answer);
                        totalAnswered++;
                    } else {
                        log('写入失败：' + answer);
                    }
                }
                await new Promise(function(r) { setTimeout(r, 400); });
            }

            if (!window._ptaRunning) break;

            if (seen.size === 0 && allRadios.length === 0) {
                if (totalAnswered > 0 || pageRound > 1) {
                    log('本页无' + (isMulti ? '多选' : '单选') + '题，答题结束');
                    break;
                }
                log('未找到' + (isMulti ? '多选' : '单选') + '题');
                if (window._ptaContinuous && !isNextButtonDisabled()) {
                    clickNextButton();
                    continue;
                }
                return 0;
            }

            if (window._ptaContinuous && !isNextButtonDisabled()) {
                clickNextButton();
            } else {
                break;
            }
        } while (true);

        return totalAnswered;
    }

    // ========== 程序填空题（批量模式）============
    async function solveProgramFillBatch() {
        if (!window._ptaRunning) return;
        var grandTotal = 0;
        var pageRound = 0;
        var maxPage = 200;

        do {
            pageRound++;
            if (pageRound > maxPage) { log('超过最大页数，停止'); break; }

            await new Promise(function(r) { setTimeout(r, 2000); });
            var inputs = getProgramFillInputs();

            if (inputs.length === 0) {
                if (grandTotal > 0 || pageRound > 1) {
                    log('本页无程序填空题，答题结束');
                    break;
                }
                log('未找到程序填空题输入框');
                if (window._ptaContinuous && !isNextButtonDisabled()) {
                    clickNextButton();
                    continue;
                }
                return 0;
            }
            log('=== 第' + pageRound + '页：' + inputs.length + ' 个填空格 ===');

            // 按 cm-editor 分组
            var groups = [];
            var usedInputs = new Set();
            for (var i = 0; i < inputs.length; i++) {
                if (usedInputs.has(inputs[i])) continue;
                var cmEditor = getInputCmEditor(inputs[i]);
                if (!cmEditor) continue;

                var cmInputs = cmEditor.querySelectorAll ? cmEditor.querySelectorAll('.cm-widgetBuffer + span input') : [];
                var groupInputs = [];
                for (var j = 0; j < cmInputs.length; j++) {
                    if (!cmInputs[j].value || cmInputs[j].value.trim() === '') {
                        groupInputs.push(cmInputs[j]);
                    }
                    usedInputs.add(cmInputs[j]);
                }
                if (groupInputs.length === 0) continue;

                var fullCode = getCmEditorCode(cmEditor) || '';
                var lang = window._ptaLang || detectLanguage(fullCode) || 'c';

                var parts = fullCode.split('______');
                var numberedParts = [];
                for (var pi = 0; pi < parts.length; pi++) {
                    if (pi > 0) numberedParts.push('【空' + pi + '】');
                    numberedParts.push(parts[pi]);
                }
                var codeForQuestion = numberedParts.join('').trim();

                var allDescs = [];
                for (var gi = 0; gi < groupInputs.length; gi++) {
                    allDescs.push(getProgramFillDescription(groupInputs[gi]) || '');
                }

                // 按 DOM 顺序排序
                groupInputs.sort(function(a, b) {
                    var aPos = a.getBoundingClientRect ? a.getBoundingClientRect().top : 99999;
                    var bPos = b.getBoundingClientRect ? b.getBoundingClientRect().top : 99999;
                    return aPos - bPos;
                });

                groups.push({
                    cmEditor: cmEditor,
                    inputs: groupInputs,
                    code: codeForQuestion,
                    desc: allDescs.join('\n---\n'),
                    lang: lang,
                    blankCount: groupInputs.length
                });
            }

            if (groups.length === 0) {
                log('本页没有需要答题的填空');
                if (window._ptaContinuous && !isNextButtonDisabled()) {
                    clickNextButton();
                    continue;
                }
                break;
            }
            log('共 ' + groups.length + ' 道题，' + inputs.length + ' 个空待答');

            var totalAnswered = 0;

            for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                showCurrent('答题中', g + 1, groups.length);
                log('===== 题 ' + (g + 1) + '/' + groups.length + '（' + group.inputs.length + '个空）=====');

                try {
                    var resp = await submitQuestion({
                        questionType: 'program-fill-batch',
                        description: group.desc,
                        code: group.code,
                        blankCount: group.blankCount,
                        language: group.lang
                    });
                    if (resp.error) { log('题' + (g+1) + ' API 错误：' + resp.error); continue; }

                    var result = resp.data;
                    if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
                    if (!result || !result.ready) { log('题' + (g+1) + ' 等待结果超时'); continue; }

                    var answerText = (extractAnswer(result) || '').trim();
                    log('[DBG] 答案原文: ' + answerText.slice(0, 200));

                    var answers = [];
                    if (answerText.includes('|')) {
                        answers = answerText.split('|').map(function(s) { return s.trim(); });
                    } else if (/\n/.test(answerText)) {
                        answers = answerText.split(/\n+/).map(function(s) { return s.trim(); });
                    } else {
                        answers = [answerText];
                    }
                    answers = answers.filter(function(s) { return s.length > 0; });
                    log('[DBG] 解析出 ' + answers.length + ' 个答案');

                    for (var ai = 0; ai < group.inputs.length; ai++) {
                        var inp = group.inputs[ai];
                        var ans = answers[ai] || answers[0] || '';
                        ans = ans.replace(/\u2260/g, '!=').replace(/\u003c\u003e/g, '!=').replace(/[≠⋠⩲]/g, '!=').trim();
                        if (ans) {
                            writeFillAnswer(inp, ans);
                            log('✓ 空' + (ai+1) + ': ' + ans.slice(0, 50));
                            totalAnswered++;
                        } else {
                            log('✗ 空' + (ai+1) + ': 无答案');
                        }
                    }
                } catch (e) {
                    log('题' + (g+1) + ' 异常：' + (e.message || String(e)));
                }

                if (g < groups.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
            }

            grandTotal += totalAnswered;
            log('本页完成，共答 ' + totalAnswered + ' 空');

            if (window._ptaContinuous && !isNextButtonDisabled()) {
                clickNextButton();
            } else {
                break;
            }
        } while (true);

        log('完成！共答 ' + grandTotal + ' 空');
        return grandTotal;
    }

    // ========== 函数题 / 编程题（共用 submit 逻辑）============

    async function submitAndWriteCode(resp, writableEditor) {
        if (resp.error) return { success: false, error: resp.error };

        var result = resp.data;
        if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
        if (!result || !result.ready) return { success: false, error: '等待结果超时' };

        var answerCode = (extractAnswer(result) || '').trim();
        if (!answerCode) return { success: false, error: '无返回代码' };

        var wrote = await writeCodeToEditor(writableEditor, answerCode);
        if (!wrote) {
            log('⚠ 代码粘贴被禁用，请手动 Ctrl+V 粘贴答案，然后点弹窗确认');
            log('[答案内容已复制到剪贴板]: ' + answerCode.slice(0, 80));
            var userConfirmed = window.confirm(
                '代码粘贴被禁用。\n答案已复制到剪贴板。\n请手动 Ctrl+V 粘贴后点【确定】继续提交。\n\n（如果不想提交，可点【取消】跳过本题）'
            );
            if (!userConfirmed) return { success: false, error: '用户取消' };
        }

        await new Promise(function(r) { setTimeout(r, 1000); });

        // 点击提交
        var submitClicked = false;
        for (var retry = 0; retry < 3 && !submitClicked; retry++) {
            var allBtns = document.querySelectorAll('button');
            for (var bi = 0; bi < allBtns.length; bi++) {
                if ((allBtns[bi].innerText || '').trim() === '提交本题作答') {
                    allBtns[bi].click();
                    submitClicked = true;
                    log('✓ 已提交(retry=' + retry + ')');
                    break;
                }
            }
            if (!submitClicked) await new Promise(function(r) { setTimeout(r, 800); });
        }
        if (!submitClicked) return { success: false, error: '未找到提交按钮' };

        // 等待评测弹窗
        var modalAppeared = await waitForResultModal(25000);
        if (modalAppeared) {
            await new Promise(function(r) { setTimeout(r, 2000); });
            closeResultModal();
            log('✓ 已关闭结果弹窗');
            return { success: true };
        }
        return { success: false, error: '评测弹窗未出现' };
    }

    async function solveFunctionBatch() {
        if (!window._ptaRunning) return;
        var totalSolved = 0;
        var maxPerSession = 50;

        for (var round = 0; round < maxPerSession; round++) {
            await new Promise(function(r) { setTimeout(r, 2000); });

            var rms = queryDeepAll('.rendered-markdown');
            var desc = rms.length > 0 ? getDeepText(rms[0]).trim() : '';
            if (!desc) { log('(题' + (round+1) + ') 未找到题目描述，可能已做完'); break; }

            var done = true;
            var editors = document.querySelectorAll('.cm-editor');
            for (var ei = 0; ei < editors.length; ei++) {
                var parent = editors[ei].parentElement;
                if (parent && !parent.className.includes('readOnly')) {
                    var content = (editors[ei].querySelector('.cm-content') || {}).innerText || '';
                    if (content.trim() === '') { done = false; break; }
                }
            }
            if (done && window._ptaSkipAnswered) {
                log('(题' + (round+1) + ') 已作答，跳过');
                if (!window._ptaContinuous) { log('连续答题未勾选，停止'); break; }
                if (isNextButtonDisabled()) { log('已是最后一题'); break; }
                clickNextButton();
                await new Promise(function(r) { setTimeout(r, 1500); });
                continue;
            }
            if (done && !window._ptaSkipAnswered) {
                log('(题' + (round+1) + ') 已作答，将重新写入答案');
            }

            log('===== 题' + (round+1) + ' =====');

            // 提取代码骨架
            var rmText = rms.length > 0 ? getDeepText(rms[0]) : '';
            var skeletonCode = '';
            var codeStart = rmText.indexOf('#include');
            var codeEnd1 = rmText.indexOf('/* 请在这里填写答案 */');
            var codeEnd2 = rmText.indexOf('你的代码将被嵌在这里 */');
            var codeEnd = Math.max(codeEnd1, codeEnd2);
            if (codeStart >= 0 && codeEnd > codeStart) {
                skeletonCode = rmText.slice(codeStart, codeEnd).trim();
            } else if (codeStart >= 0) {
                skeletonCode = rmText.slice(codeStart).trim();
            }

            // 找可写编辑器
            var writableEditor = null;
            for (var ei = 0; ei < editors.length; ei++) {
                var parent = editors[ei].parentElement;
                if (parent && !parent.className.includes('readOnly')) {
                    var cmContent = editors[ei].querySelector('.cm-content');
                    if (cmContent && ((cmContent.innerText || '').trim() === '' || !window._ptaSkipAnswered)) {
                        writableEditor = editors[ei]; break;
                    }
                }
            }

            if (!writableEditor) {
                log('(题' + (round+1) + ') 未找到可写编辑器，可能已做完');
                if (!window._ptaContinuous) { log('连续答题未勾选，停止'); break; }
                if (isNextButtonDisabled()) break;
                clickNextButton();
                await new Promise(function(r) { setTimeout(r, 1500); });
                continue;
            }

            var lang = window._ptaLang || 'c';

            var resp = await submitQuestion({
                questionType: 'function',
                description: desc,
                code: skeletonCode.trim(),
                language: lang
            });

            var submitResult = await submitAndWriteCode(resp, writableEditor);
            if (submitResult.success) {
                totalSolved++;
                if (!window._ptaContinuous) { log('连续答题未勾选，答题结束'); break; }
            }

            if (!window._ptaContinuous) { log('连续答题未勾选，停止'); break; }
            if (isNextButtonDisabled()) { log('已是最后一题，结束'); break; }
            clickNextButton();
            await new Promise(function(r) { setTimeout(r, 1500); });
        }

        log('===== 完成！本次函数/编程题共解决 ' + totalSolved + ' 道 =====');
        return totalSolved;
    }

    async function solveProgrammingBatch() {
        if (!window._ptaRunning) return;
        var totalSolved = 0;
        var maxPerSession = 50;

        for (var round = 0; round < maxPerSession; round++) {
            await new Promise(function(r) { setTimeout(r, 2000); });

            var rms = queryDeepAll('.rendered-markdown');
            var desc = rms.length > 0 ? getDeepText(rms[0]).trim() : '';
            if (!desc) { log('(题' + (round+1) + ') 未找到题目描述，可能已做完'); break; }

            var done = true;
            var editors = document.querySelectorAll('.cm-editor');
            for (var ei = 0; ei < editors.length; ei++) {
                var parent = editors[ei].parentElement;
                if (parent && !parent.className.includes('readOnly')) {
                    var content = (editors[ei].querySelector('.cm-content') || {}).innerText || '';
                    if (content.trim() === '') { done = false; break; }
                }
            }
            if (done && window._ptaSkipAnswered) {
                log('(题' + (round+1) + ') 已作答，跳过');
                if (!window._ptaContinuous) { log('连续答题未勾选，停止'); break; }
                if (isNextButtonDisabled()) { log('已是最后一题'); break; }
                clickNextButton();
                await new Promise(function(r) { setTimeout(r, 1500); });
                continue;
            }
            if (done && !window._ptaSkipAnswered) {
                log('(题' + (round+1) + ') 已作答，将重新写入答案');
            }

            log('===== 题' + (round+1) + ' =====');

            var rm = document.querySelector('.rendered-markdown');
            var q = extractProgrammingQuestion(rm);
            if (!q.sample_input && !q.sample_output && rm) {
                var savedH = rm.style.height, savedMH = rm.style.maxHeight, savedO = rm.style.overflow;
                rm.style.maxHeight = 'none'; rm.style.overflow = 'visible';
                q.code = (rm.textContent || rm.innerText || '').trim();
                rm.style.height = savedH; rm.style.maxHeight = savedMH; rm.style.overflow = savedO;
            }

            console.log('[PTA-PROG] 提取结果:');
            console.log('描述: ' + (q.desc || '').slice(0, 200));
            console.log('样本输入: ' + (q.sample_input || '').slice(0, 100));
            console.log('样本输出: ' + (q.sample_output || '').slice(0, 200));

            var lang = window._ptaLang || 'c';

            var resp = await submitQuestion({
                questionType: 'programming',
                description: q.desc || desc,
                input_spec: q.input_spec || '',
                output_spec: q.output_spec || '',
                sample_input: q.sample_input || '',
                sample_output: q.sample_output || '',
                code: q.code || '',
                _think: window._ptaThink,
                language: lang
            });

            var writableEditor = null;
            var allEditors = document.querySelectorAll('.cm-editor');
            for (var ei = 0; ei < allEditors.length; ei++) {
                var parent = allEditors[ei].parentElement;
                if (parent && !parent.className.includes('readOnly')) {
                    var cmContent = allEditors[ei].querySelector('.cm-content');
                    if (cmContent && ((cmContent.innerText || '').trim() === '' || !window._ptaSkipAnswered)) {
                        writableEditor = allEditors[ei]; break;
                    }
                }
            }

            var submitResult = await submitAndWriteCode(resp, writableEditor);
            if (submitResult.success) {
                totalSolved++;
                if (!window._ptaContinuous) { log('连续答题未勾选，答题结束'); break; }
            }

            if (!window._ptaContinuous) { log('连续答题未勾选，停止'); break; }
            if (isNextButtonDisabled()) { log('已是最后一题'); break; }
            clickNextButton();
            await new Promise(function(r) { setTimeout(r, 1500); });
        }

        log('===== 完成！本次编程题共解决 ' + totalSolved + ' 道 =====');
        return totalSolved;
    }

    // ========== 检查模型 ==========
    async function runCheck(qText, answer, qType, qNum) {
        if (!window._ptaModelCheck) return { correct: null, reason: '未启用检查模型' };

        var qTypeName = qType === 'judge' ? '判断题（选 T 或 F）'
            : qType === 'choice' ? '单选题'
            : qType === 'multi_choice' ? '多选题'
            : '其他';

        var checkPrompt = qText + '\n\n【已选答案】' + answer + '\n\n请分析以上题目，判断已选答案是否正确。只输出：\n结论：正确 / 错误\n理由：（一句话说明）';

        var resp = await submitQuestion({
            questionType: qType,
            description: checkPrompt,
            _think: window._ptaCheckThink !== false
        });
        if (resp.error) return { correct: null, reason: 'API错误: ' + resp.error };

        var result = resp.data;
        if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
        if (!result || !result.ready) return { correct: null, reason: '等待超时' };

        var checkResult = (result.answer || '').trim();
        console.log('[PTA-检查' + qNum + ']:\n' + checkResult);

        var isCorrect = /正确|对|yes|correct/i.test(checkResult) && !/错误|错|no|wrong/i.test(checkResult);
        var isWrong = /错误|错|no|wrong/i.test(checkResult);
        if (isWrong) return { correct: false, reason: checkResult.slice(0, 100) };
        if (isCorrect) return { correct: true, reason: checkResult.slice(0, 100) };
        return { correct: null, reason: checkResult.slice(0, 100) };
    }

    async function runBatchCheck() {
        if (!window._ptaAutoCheck || !window._ptaModelCheck) return;
        var logEl = document.getElementById('pta-auto-log');
        if (!logEl) return;

        var qaList = [];
        var lines = logEl.querySelectorAll('div');
        for (var li = 0; li < lines.length; li++) {
            var txt = lines[li].textContent || '';
            var m = txt.match(/^✓?\s*\(?(\d+)\)?\s*[题:]?\s*(.+)/);
            if (m) qaList.push('第' + m[1] + '题：已选 ' + m[2].trim());
        }
        if (qaList.length === 0) { log('检查：无有效答题记录'); return; }

        var checkPrompt = '【答题检查】请分析以下所有已答题目的题干和选项，判断每个已选答案是否正确。\n\n格式要求：\n- 对：✓ 题号\n- 错：✗ 题号（正确选项：X）\n\n' + qaList.join('\n') + '\n\n请逐题给出判断（✓ 对 / ✗ 错），错题请在后面写出正确选项。';

        log('🔍 检查模型分析中（共' + qaList.length + '题）...');
        var resp = await submitQuestion({
            questionType: 'judge',
            description: checkPrompt,
            _think: window._ptaCheckThink !== false
        });
        if (resp.error) { log('检查失败：' + resp.error); return; }

        var result = resp.data;
        if (result && result.answer === undefined) result = await waitForResult(resp.data.task_id);
        if (!result || !result.ready) { log('检查超时'); return; }

        var checkResult = (result.answer || '').trim();
        console.log('[PTA-批量检查]:\n' + checkResult);
        log('===== 检查结果 =====');
        var resultLines = checkResult.split('\n');
        for (var ri = 0; ri < resultLines.length; ri++) {
            var line = resultLines[ri].trim();
            if (line) log(line);
        }
    }

    // ========== 自动解题入口 ==========
    async function autoSolve() {
        if (!window._ptaRunning) return;
        try {
            log('开始解题...');
            var qType = detectQuestionType();
            var answered = 0;
            if (!window._ptaRunning) { log('已停止'); return 0; }

            if      (qType === 'fill')          answered = await solveFillBatch();
            else if (qType === 'judge')         answered = await solveJudgeBatch();
            else if (qType === 'choice')        answered = await solveChoiceBatch(false);
            else if (qType === 'multi_choice')  answered = await solveChoiceBatch(true);
            else if (qType === 'program_fill')  answered = await solveProgramFillBatch();
            else if (qType === 'function')      answered = await solveFunctionBatch();
            else if (qType === 'programming')   answered = await solveProgrammingBatch();
            else                                log('未知题型：' + qType);

            log('完成！已答 ' + answered + ' 题');
            if (answered > 0) runBatchCheck();
        } finally {
            resetGoButton();
        }
    }

    function resetGoButton() {
        window._ptaRunning = false;
        var btn = document.getElementById('pta-auto-go');
        if (btn) {
            btn.textContent = '▶ 开始解题';
            btn.style.background = '#222';
        }
    }

    // ========== UI 面板 ==========
    function initPanel() {
        var existing = document.getElementById('pta-auto-panel');
        if (existing) { existing.remove(); }
        window._ptaSkipAnswered = false;
        window._ptaContinuous   = false;
        window._ptaThink        = false;
        window._ptaModelCheck   = '';
        window._ptaRunning      = false;
        window._ptaAutoCheck    = false;
        window._ptaCheckThink   = false;

        var panel = document.createElement('div');
        panel.id = 'pta-auto-panel';
        panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;min-width:200px;max-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:transform 0.25s ease,opacity 0.25s ease;';
        panel.innerHTML =
            '<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#111;display:flex;align-items:center;justify-content:space-between;">' +
                '<span>PTA Auto <span style="color:#999;font-weight:400;">v52</span> <span style="font-size:10px;color:#aaa;">by NeuronCState</span></span>' +
                '<button id="pta-settings-btn" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 2px;color:#666;" title="DeepSeek 设置">⚙</button>' +
            '</div>' +
            '<div id="pta-ds-settings" style="display:none;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;margin-bottom:8px;">DeepSeek API 设置</div>' +
                '<div style="margin-bottom:7px;">' +
                    '<div style="font-size:11px;color:#666;margin-bottom:3px;">Provider</div>' +
                    '<select id="pta-provider" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;">' +
                        '<option value="ollama">Ollama（本地模型）</option>' +
                        '<option value="deepseek">DeepSeek（API）</option>' +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:7px;">' +
                    '<div style="font-size:11px;color:#666;margin-bottom:3px;">API Key</div>' +
                    '<input id="pta-ds-apikey" type="password" placeholder="sk-xxx...xxxx" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;box-sizing:border-box;">' +
                '</div>' +
                '<div style="margin-bottom:7px;">' +
                    '<div style="font-size:11px;color:#666;margin-bottom:3px;">模型名称</div>' +
                    '<input id="pta-ds-model" type="text" placeholder="deepseek-chat" value="deepseek-chat" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;box-sizing:border-box;">' +
                '</div>' +
                '<div style="margin-bottom:8px;">' +
                    '<div style="font-size:11px;color:#666;margin-bottom:3px;">Base URL</div>' +
                    '<input id="pta-ds-baseurl" type="text" placeholder="https://api.deepseek.com" value="https://api.deepseek.com" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;box-sizing:border-box;">' +
                '</div>' +
                '<button id="pta-ds-save" style="width:49%;padding:6px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">保存设置</button>' +
                '<button id="pta-ds-test" style="width:49%;padding:6px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">测试连接</button>' +
                '<div id="pta-ds-msg" style="font-size:11px;color:#666;margin-top:5px;text-align:center;"></div>' +
            '</div>' +
            '<div id="q-current" style="font-size:11px;color:#666;margin-bottom:8px;max-height:48px;overflow:hidden;line-height:1.4;">待机</div>' +
            '<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:12px;color:#555;">语言</span>' +
                '<select id="pta-lang-select" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;">' +
                    '<option value="c">C</option><option value="cpp">C++</option><option value="python">Python</option><option value="java">Java</option>' +
                '</select>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">' +
                '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;cursor:pointer;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;">' +
                    '<input type="checkbox" id="pta-skip-answered" style="cursor:pointer;">' +
                    '<span>跳过已答</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;cursor:pointer;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;">' +
                    '<input type="checkbox" id="pta-continuous" style="cursor:pointer;">' +
                    '<span>连续答题</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;cursor:pointer;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;">' +
                    '<input type="checkbox" id="pta-think" style="cursor:pointer;">' +
                    '<span>启动思考</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;cursor:pointer;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;">' +
                    '<input type="checkbox" id="pta-autocheck" style="cursor:pointer;">' +
                    '<span>自动检查</span>' +
                '</label>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
                '<div>' +
                    '<div style="font-size:11px;color:#555;margin-bottom:3px;">模型 · 选择/填空</div>' +
                    '<select id="pta-model-default" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;"><option value="">加载中…</option></select>' +
                '</div>' +
                '<div>' +
                    '<div style="font-size:11px;color:#555;margin-bottom:3px;">模型 · 函数/编程</div>' +
                    '<select id="pta-model-hard" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;"><option value="">加载中…</option></select>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                '<div style="flex:1;">' +
                    '<div style="font-size:11px;color:#555;margin-bottom:3px;">模型 · 检查</div>' +
                    '<select id="pta-model-check" style="width:100%;padding:4px 6px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#333;font-size:12px;"><option value="">不启用</option></select>' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#555;cursor:pointer;white-space:nowrap;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;margin-top:18px;">' +
                    '<input type="checkbox" id="pta-checkthink" style="cursor:pointer;">' +
                    '<span>启动检查思考</span>' +
                '</label>' +
            '</div>' +
            '<button id="pta-auto-go" style="width:100%;padding:8px 12px;background:#222;color:#fff;border:none;border-radius:7px;font-size:13px;cursor:pointer;">▶ 开始解题</button>' +
            '<button id="pta-auto-diag" style="width:100%;margin-top:5px;padding:7px;background:#f3f4f6;color:#333;border:none;border-radius:7px;font-size:12px;cursor:pointer;">诊断</button>' +
            '<div id="pta-auto-log" style="margin-top:10px;font-size:11px;color:#999;max-height:80px;overflow-y:auto;line-height:1.6;"></div>';

        document.body.appendChild(panel);

        // 折叠按钮
        var toggleTab = document.createElement('div');
        toggleTab.id = 'pta-auto-toggle-tab';
        toggleTab.style.cssText =
            'position:fixed;bottom:16px;right:16px;width:40px;height:40px;background:#222;border-radius:8px;cursor:pointer;' +
            'display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;z-index:100001;box-shadow:0 2px 8px rgba(0,0,0,0.2);user-select:none;';
        toggleTab.textContent = '›';
        toggleTab.title = '折叠面板';
        document.body.appendChild(toggleTab);

        var panelHidden = false;
        function updateToggle() {
            if (panelHidden) {
                panel.style.transform = 'translateX(calc(100% + 16px))';
                panel.style.opacity = '0';
                panel.style.pointerEvents = 'none';
                toggleTab.style.right = '0px';
                toggleTab.textContent = '‹';
                toggleTab.title = '展开面板';
            } else {
                panel.style.transform = '';
                panel.style.opacity = '';
                panel.style.pointerEvents = '';
                toggleTab.style.right = '16px';
                toggleTab.textContent = '›';
                toggleTab.title = '折叠面板';
            }
        }

        toggleTab.addEventListener('click', function() {
            panelHidden = !panelHidden;
            updateToggle();
        });

        // DeepSeek 设置
        function applyDsSettingsToUI() {
            document.getElementById('pta-provider').value  = _ptaDsSettings.provider || 'ollama';
            document.getElementById('pta-ds-apikey').value  = _ptaDsSettings.apiKey || '';
            document.getElementById('pta-ds-model').value   = _ptaDsSettings.model || 'deepseek-chat';
            document.getElementById('pta-ds-baseurl').value = _ptaDsSettings.baseUrl || 'https://api.deepseek.com';
        }
        applyDsSettingsToUI();

        document.getElementById('pta-settings-btn').addEventListener('click', function() {
            var el = document.getElementById('pta-ds-settings');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('pta-ds-save').addEventListener('click', function() {
            var apiKeyVal = document.getElementById('pta-ds-apikey').value.trim();
            var modelVal  = document.getElementById('pta-ds-model').value.trim() || 'deepseek-chat';
            var baseUrlVal = document.getElementById('pta-ds-baseurl').value.trim() || 'https://api.deepseek.com';
            var providerVal = document.getElementById('pta-provider').value;

            _ptaDsSettings = {
                provider: providerVal,
                apiKey: apiKeyVal,
                model: modelVal,
                baseUrl: baseUrlVal
            };

            localStorage.setItem('_ptaDsSettings', JSON.stringify(_ptaDsSettings));

            var msg = document.getElementById('pta-ds-msg');
            msg.textContent = '✓ 已保存到浏览器（永久有效）';
            msg.style.color = '#10b981';
            setTimeout(function() { msg.textContent = ''; }, 3000);

            if (providerVal === 'deepseek' && apiKeyVal) {
                api('/config', {
                    method: 'POST',
                    body: { api_key: apiKeyVal, model: modelVal, base_url: baseUrlVal }
                });
            }
        });

        document.getElementById('pta-ds-test').addEventListener('click', function() {
            var msg = document.getElementById('pta-ds-msg');
            var apiKey  = document.getElementById('pta-ds-apikey').value.trim();
            var model   = document.getElementById('pta-ds-model').value.trim() || 'deepseek-chat';
            var baseUrl = document.getElementById('pta-ds-baseurl').value.trim() || 'https://api.deepseek.com';
            if (!apiKey) {
                msg.textContent = '⚠ 请先输入 API Key';
                msg.style.color = '#ef4444';
                return;
            }
            msg.textContent = '⏳ 测试中...';
            msg.style.color = '#666';

            new Promise(function(resolve) {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: baseUrl + '/chat/completions',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                    data: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'say hello' }], max_tokens: 5 }),
                    timeout: 15000,
                    onload: function(resp) {
                        if (resp.status === 200) resolve(true);
                        else {
                            try { var err = JSON.parse(resp.responseText); resolve('错误 ' + resp.status + ': ' + (err.error && err.error.message ? err.error.message : resp.responseText.slice(0, 100))); }
                            catch(e) { resolve('HTTP ' + resp.status + ': ' + resp.responseText.slice(0, 100)); }
                        }
                    },
                    onerror: function(err) { resolve('网络错误: ' + (err.message || String(err))); },
                    ontimeout: function() { resolve('请求超时（15秒）'); }
                });
            }).then(function(ok) {
                if (ok === true) {
                    msg.textContent = '✓ 连接成功！API Key 有效';
                    msg.style.color = '#10b981';
                } else {
                    msg.textContent = '✗ ' + ok;
                    msg.style.color = '#ef4444';
                }
            });
        });

        document.getElementById('pta-auto-go').addEventListener('click', function() {
            var btn = document.getElementById('pta-auto-go');
            if (window._ptaRunning) {
                window._ptaRunning = false;
                btn.textContent = '▶ 开始解题';
                btn.style.background = '#222';
                log('已停止解题');
                return;
            }
            window._ptaLang          = document.getElementById('pta-lang-select').value;
            window._ptaSkipAnswered  = document.getElementById('pta-skip-answered').checked;
            window._ptaContinuous    = document.getElementById('pta-continuous').checked;
            window._ptaThink          = document.getElementById('pta-think').checked;
            window._ptaAutoCheck     = document.getElementById('pta-autocheck') ? document.getElementById('pta-autocheck').checked : false;
            window._ptaCheckThink     = document.getElementById('pta-checkthink') ? document.getElementById('pta-checkthink').checked : false;
            window._ptaModelDefault   = document.getElementById('pta-model-default').value;
            window._ptaModelHard     = document.getElementById('pta-model-hard').value;
            window._ptaModelCheck    = document.getElementById('pta-model-check').value;
            window._ptaDescCache     = null;
            window._ptaRunning        = true;
            btn.textContent           = '■ 停止解题';
            btn.style.background      = '#dc2626';
            autoSolve();
        });

        // 加载 Ollama 模型列表
        async function loadModelList() {
            try {
                var r = await api('/models');
                if (r.ok && r.data && r.data.models && r.data.models.length > 0) {
                    var models = r.data.models;
                    var selDefault = document.getElementById('pta-model-default');
                    var selHard    = document.getElementById('pta-model-hard');
                    var selCheck   = document.getElementById('pta-model-check');
                    models.forEach(function(m) {
                        var shortName = m.split('/').pop();
                        selDefault.add(new Option(shortName + ' (' + m + ')', m));
                        selHard.add(new Option(shortName + ' (' + m + ')', m));
                        selCheck.add(new Option(shortName, m));
                    });
                    for (var i = 0; i < selDefault.options.length; i++) {
                        if (selDefault.options[i].value.includes('qwen2.5-coder')) { selDefault.selectedIndex = i; break; }
                    }
                    for (var j = 0; j < selHard.options.length; j++) {
                        if (selHard.options[j].value.includes('qwen3.5') && selHard.options[j].value.includes('9B')) { selHard.selectedIndex = j; break; }
                    }
                    for (var k = 0; k < selCheck.options.length; k++) {
                        if (selCheck.options[k].value.includes('qwen3.5') && selCheck.options[k].value.includes('9B')) { selCheck.selectedIndex = k; break; }
                    }
                    window._ptaModelCheck = selCheck.value;
                } else {
                    selDefault.innerHTML = '<option value="">无可用模型</option>';
                    selHard.innerHTML    = '<option value="">无可用模型</option>';
                    selCheck.innerHTML   = '<option value="">无可用模型</option>';
                }
            } catch (e) {
                document.getElementById('pta-model-default').innerHTML = '<option value="">加载失败</option>';
                document.getElementById('pta-model-hard').innerHTML    = '<option value="">加载失败</option>';
                document.getElementById('pta-model-check').innerHTML   = '<option value="">加载失败</option>';
            }
        }
        loadModelList();

        // 根据题集名称自动预选语言
        (function autoSelectLang() {
            var detected = detectLanguageFromExamName();
            if (!detected) return;
            var sel = document.getElementById('pta-lang-select');
            if (!sel) return;
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === detected) { sel.selectedIndex = i; window._ptaLang = detected; break; }
            }
            var langNames = { python: 'Python', c: 'C', cpp: 'C++', java: 'Java' };
            var logEl = document.getElementById('pta-auto-log');
            if (logEl) {
                var div = document.createElement('div');
                div.textContent = '【自动】题集语言检测为：' + (langNames[detected] || detected) + '，已预选';
                logEl.appendChild(div);
            }
        })();

        document.getElementById('pta-auto-diag').addEventListener('click', function() {
            var el = document.getElementById('pta-auto-log');
            function dlog(msg) {
                var div = document.createElement('div');
                div.textContent = msg;
                el.appendChild(div);
                el.scrollTop = el.scrollHeight;
                console.log('[PTA-DIAG] ' + msg);
            }
            dlog('===== 诊断开始 =====');
            dlog('[PTA-Auto v52] 诊断运行');

            api('/status', {}).then(function(r) {
                if (r.ok && r.data) {
                    dlog('API: 正常 (port=' + r.data.port + ')');
                    dlog('Ollama: ' + r.data.ollama);
                    dlog('默认模型: ' + r.data.model);
                } else { dlog('API: 失败 ' + (r.error || '')); }
            }).catch(function(e) { dlog('API: 连接异常 ' + e.message); });

            api('/models', {}).then(function(r) {
                if (r.ok && r.data && r.data.models) dlog('模型: ' + r.data.models.join(', '));
            });

            dlog('题型: ' + detectQuestionType());
            dlog('cm-editor: ' + document.querySelectorAll('.cm-editor').length);

            var testCm = document.querySelector('.cm-editor');
            if (testCm) {
                var tc = testCm.querySelector('.cm-content');
                if (tc && tc.cmTile && tc.cmTile.view) {
                    var tile = tc.cmTile;
                    tile.view.dispatch({ changes: { from: 0, to: tile.view.state.doc.length, insert: 'DIAG_TEST' } });
                    var ok = (tc.innerText || '').includes('DIAG_TEST');
                    tile.view.dispatch({ changes: { from: 0, to: tile.view.state.doc.length, insert: '' } });
                    dlog('cmTile写入: ' + (ok ? '成功' : '失败'));
                }
            }
            dlog('===== 诊断结束 =====');
        });

        document.getElementById('pta-lang-select').addEventListener('change', function(e) {
            window._ptaLang = e.target.value;
        });

        // 初始显示
        setTimeout(function() {
            var t = detectQuestionType();
            var labels = { 'judge': '✓ 判断题', 'choice': '🔘 单选', 'multi_choice': '☑️ 多选', 'fill': '✏️ 填空题', 'program_fill': '💻 程序填空', 'function': '🔧 函数题', 'programming': '⌨️ 编程题', 'unknown': '❓ 未知' };
            document.getElementById('q-current').textContent = '题型：' + (labels[t] || t);
        }, 2000);

        // URL 轮询检测题型变化
        var lastUrl = location.pathname;
        setInterval(function() {
            if (location.pathname !== lastUrl) {
                lastUrl = location.pathname;
                var t = detectQuestionType();
                var labels = { 'judge': '✓ 判断题', 'choice': '🔘 单选', 'multi_choice': '☑️ 多选', 'fill': '✏️ 填空题', 'program_fill': '💻 程序填空', 'function': '🔧 函数题', 'programming': '⌨️ 编程题', 'unknown': '❓ 未知' };
                var el = document.getElementById('q-current');
                if (el) el.textContent = '题型：' + (labels[t] || t);
                window._ptaDescCache = null;
                var detected = detectLanguageFromExamName();
                if (detected) {
                    var sel = document.getElementById('pta-lang-select');
                    if (sel) {
                        for (var i = 0; i < sel.options.length; i++) {
                            if (sel.options[i].value === detected) { sel.selectedIndex = i; window._ptaLang = detected; break; }
                        }
                    }
                }
            }
        }, 1000);
    }

    // ========== 启动 ==========
    if (document.readyState === 'complete') {
        initPanel();
    } else {
        window.addEventListener('load', initPanel);
    }
})();
