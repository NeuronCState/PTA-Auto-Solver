// ==UserScript==
// @name         PTA Auto Solver
// @namespace    https://pintia.cn/
// @version      1.4.1
// @description  轻量、清晰的 PTA AI 辅助答题脚本
// @author       NeuronCState
// @match        https://pintia.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.deepseek.com
// @connect      api.xiaomimimo.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    var STORAGE_KEY = 'pta-auto-solver-v1';
    var PROVIDERS = {
        deepseek: {
            name: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com/v1',
            auth: 'bearer',
            supportsImages: false,
            hint: '文字 / 代码 · 默认关闭图片'
        },
        mimo: {
            name: 'MiMo',
            baseUrl: 'https://api.xiaomimimo.com/v1',
            auth: 'api-key',
            supportsImages: true,
            hint: '推理 / 代码 · 默认开启图片'
        }
    };
    var LANG_NAMES = { c: 'C', cpp: 'C++', python: 'Python', java: 'Java', pascal: 'Pascal' };
    var QUESTION_TYPES = { '1': 'judge', '2': 'choice', '3': 'multi_choice', '4': 'fill', '5': 'program_fill', '6': 'function', '7': 'programming' };
    var state = {
        running: false,
        provider: 'deepseek',
        configs: {
            deepseek: { apiKey: '', model: '', models: [], modelError: '', images: false },
            mimo: { apiKey: '', model: '', models: [], modelError: '', images: true }
        },
        skipAnswered: true,
        continuous: true,
        language: 'auto',
        theme: 'light'
    };

    function readJson(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (e) { return fallback; }
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function loadState() {
        var saved = readJson(STORAGE_KEY, null);
        if (saved) {
            state.provider = saved.provider === 'mimo' ? 'mimo' : 'deepseek';
            state.configs = Object.assign(state.configs, saved.configs || {});
            state.configs.deepseek = Object.assign({ apiKey: '', model: '', models: [], modelError: '', images: false }, state.configs.deepseek || {});
            state.configs.mimo = Object.assign({ apiKey: '', model: '', models: [], modelError: '', images: true }, state.configs.mimo || {});
            state.skipAnswered = saved.skipAnswered !== false;
            state.continuous = saved.continuous !== false;
            state.language = ['auto', 'c', 'cpp', 'python', 'java', 'pascal'].indexOf(saved.language) >= 0 ? saved.language : 'auto';
            state.theme = saved.theme === 'dark' ? 'dark' : 'light';
            return;
        }

        // 一次性兼容旧版本的 AI 配置。
        var legacy = readJson('_ptaSettings', null) || readJson('_ptaDsSettings', null);
        if (legacy) {
            state.configs.deepseek.apiKey = legacy.key || legacy.apiKey || '';
            state.configs.deepseek.model = legacy.model || '';
            if (legacy.provider && /mimo/i.test(legacy.provider)) state.provider = 'mimo';
        }
        saveState();
    }

    function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function queryAll(selector, root) {
        var result = [];
        root = root || document;
        try { result = Array.prototype.slice.call(root.querySelectorAll(selector)); } catch (e) {}
        var nodes = [];
        try { nodes = Array.prototype.slice.call(root.querySelectorAll('*')); } catch (e2) {}
        nodes.forEach(function (node) {
            if (node.shadowRoot) result = result.concat(queryAll(selector, node.shadowRoot));
        });
        return result;
    }

    function textOf(el) {
        if (!el) return '';
        return String(el.innerText || el.textContent || '').replace(/\u200b/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/复制内容|格式|全屏|收起▾?|展开/g, ' ')
            .replace(/\[?\s*C\+\+\s*\]?/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function nearestProblem(el) {
        var current = el;
        while (current && current !== document.body) {
            var cls = current.className && String(current.className);
            var text = textOf(current);
            if (current.classList && (
                current.classList.contains('pc-x') ||
                current.classList.contains('space-y-4') ||
                /question|problem|exam-item/i.test(cls || '')
            ) && text.length > 10) return current;
            current = current.parentElement;
        }
        return el && (el.closest && el.closest('section, form')) || el && el.parentElement || document.body;
    }

    function getEditorDoc(editor) {
        var content = editor && editor.querySelector('.cm-content');
        if (!content) return '';
        try {
            var tile = content.cmTile;
            if (tile && tile.view && tile.view.state && tile.view.state.doc) {
                return tile.view.state.doc.sliceString(0, tile.view.state.doc.length);
            }
        } catch (e) {}
        return textOf(content);
    }

    function editorEmpty(editor) { return getEditorDoc(editor).trim().length < 2; }

    function editorForInput(input) {
        var current = input;
        while (current && current !== document.body) {
            if (current.classList && current.classList.contains('cm-editor')) return current;
            current = current.parentElement;
        }
        return null;
    }

    function editableEditor(preferEmpty) {
        var editors = queryAll('.cm-editor');
        for (var i = 0; i < editors.length; i++) {
            var parentText = String((editors[i].parentElement && editors[i].parentElement.className) || '');
            if (/readonly|readOnly/i.test(parentText)) continue;
            if (!preferEmpty || editorEmpty(editors[i])) return editors[i];
        }
        return null;
    }

    function writeEditor(editor, code) {
        if (!editor || !code) return false;
        var content = editor.querySelector('.cm-content') || editor;
        var views = [];
        try {
            if (content.cmTile && content.cmTile.view) views.push(content.cmTile.view);
            queryAll('*', editor).forEach(function (el) {
                var view = el._view || el._cmView || el.__view;
                if (view && view.dispatch && view.state) views.push(view);
            });
        } catch (e) {}
        for (var i = 0; i < views.length; i++) {
            try {
                views[i].dispatch({ changes: { from: 0, to: views[i].state.doc.length, insert: code }, selection: { anchor: code.length } });
                return true;
            } catch (e2) {}
        }
        try {
            if (typeof GM_setClipboard === 'function') GM_setClipboard(code);
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code);
        } catch (e3) {}
        return false;
    }

    function writeInput(input, value) {
        if (!input) return false;
        try {
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
        } catch (e) { input.value = value; }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }

    function detectType() {
        var match = location.pathname.match(/\/exam\/problems\/type\/(\d+)/);
        if (match) return QUESTION_TYPES[match[1]] || 'unknown';
        var body = textOf(document.body);
        if (/程序设计|编程题/.test(body) && queryAll('.cm-editor').length) return 'programming';
        return 'unknown';
    }

    function detectLanguage(code) {
        var value = ((code || '') + ' ' + document.title + ' ' + location.href).toLowerCase();
        if (/public\s+class|system\.out|import\s+java\./.test(value)) return 'java';
        if (/def\s+\w+\s*\(|print\s*\(|import\s+\w+|__name__/.test(value)) return 'python';
        if (/cout|cin|iostream|std::|vector\s*<|c\+\+|\bcpp\b/.test(value)) return 'cpp';
        if (/pascal|delphi/.test(value)) return 'pascal';
        return 'c';
    }

    function resolveLanguage(code, preferred) {
        var selected = preferred || state.language;
        return selected && selected !== 'auto' ? selected : detectLanguage(code || '');
    }

    function languageLabel(code) { return LANG_NAMES[resolveLanguage('', code)] || 'C'; }

    function extractOptions(problem) {
        var labels = queryAll('label', problem).filter(function (label) {
            return !!label.querySelector('input[type="radio"], input[type="checkbox"]');
        });
        var options = labels.map(function (label) {
            var value = cleanText(textOf(label));
            var match = value.match(/^\s*([A-F]|T|F|正确|错误)[.)、：:\s]/i);
            return { label: match ? match[1].toUpperCase() : '', text: value, input: label.querySelector('input[type="radio"], input[type="checkbox"]') };
        }).filter(function (option) { return option.text; });
        return options.length ? options : null;
    }

    function problemImages(problem) {
        return queryAll('img', problem).map(function (img) {
            return img.currentSrc || img.src || img.getAttribute('data-src') || '';
        }).filter(function (src, index, list) { return src && list.indexOf(src) === index; }).slice(0, 6);
    }

    function questionText(problem) {
        var clone = problem.cloneNode(true);
        queryAll('label, input, button, .cm-editor', clone).forEach(function (el) { el.remove(); });
        return cleanText(textOf(clone)).slice(0, 9000);
    }

    function problemCodeBlocks(problem) {
        return queryAll('.cm-editor', problem).map(function (editor) {
            return cleanText(getEditorDoc(editor) || textOf(editor));
        }).filter(Boolean);
    }

    function sectionCode(problem, startPattern, endPattern) {
        var nodes = Array.prototype.slice.call(problem.querySelectorAll('h1,h2,h3,h4,.cm-editor'));
        var active = false, result = [];
        nodes.forEach(function (node) {
            var isHeading = /^H[1-4]$/.test(node.tagName);
            if (isHeading) {
                var heading = cleanText(textOf(node));
                if (active && endPattern && endPattern.test(heading)) active = false;
                if (startPattern.test(heading)) active = true;
                return;
            }
            if (active && node.classList && node.classList.contains('cm-editor')) {
                var code = cleanText(getEditorDoc(node) || textOf(node));
                if (code) result.push(code);
            }
        });
        return result;
    }

    function beforeFirstSection(text) {
        var match = String(text || '').search(/函数接口定义[：:]|裁判测试程序样例[：:]|输入格式[：:]|输出格式[：:]|样例输入|输入样例|Sample\s+Input/i);
        return cleanText(match >= 0 ? text.slice(0, match) : text).slice(0, 6000);
    }

    function findSection(text, headers, ends) {
        var start = -1;
        headers.some(function (header) {
            var match = text.match(header);
            if (match && (start < 0 || match.index < start)) { start = match.index + match[0].length; return true; }
            return false;
        });
        if (start < 0) return '';
        var end = text.length;
        ends.forEach(function (endPattern) {
            var match = new RegExp(endPattern.source, endPattern.flags.replace('g', '')).exec(text.slice(start));
            if (match && start + match.index < end) end = start + match.index;
        });
        return cleanText(text.slice(start, end)).slice(0, 1600);
    }

    function extractProgramming(problem) {
        var raw = questionText(problem);
        var ends = [/输入格式[：:]/, /输出格式[：:]/, /样例输入[：:]/, /样例输出[：:]/, /Sample\s+Input[：:]/i, /Sample\s+Output[：:]/i, /提示[：:]/];
        var allCode = problemCodeBlocks(problem);
        var sampleInputCodes = sectionCode(problem, /样例输入|输入样例|Sample\s+Input/i, /样例输出|输出样例|Sample\s+Output/i);
        var sampleOutputCodes = sectionCode(problem, /样例输出|输出样例|Sample\s+Output/i, /提示|样例输入|输入样例|Sample\s+Input/i);
        var sampleCodes = sampleInputCodes.concat(sampleOutputCodes);
        var frameworkCodes = allCode.filter(function (code) { return sampleCodes.indexOf(code) < 0; });
        var q = {
            desc: findSection(raw, [/^题目[：:]/m, /^问题[：:]/m], ends) || beforeFirstSection(raw),
            input: findSection(raw, [/输入格式[：:]/, /输入描述[：:]/, /Input\s+Format[：:]/i], ends),
            output: findSection(raw, [/输出格式[：:]/, /输出描述[：:]/, /Output\s+Format[：:]/i], ends),
            sampleInput: sampleInputCodes.join('\n\n') || findSection(raw, [/样例输入\s*\d*[：:]?\s*\n/, /输入样例\s*\d*[：:]?\s*\n/, /Sample\s+Input\s*\d*[：:]?\s*\n/i], [/样例输出[：:]/, /输出样例[：:]/, /Sample\s+Output[：:]/i].concat(ends)),
            sampleOutput: sampleOutputCodes.join('\n\n') || findSection(raw, [/样例输出\s*\d*[：:]?\s*\n/, /输出样例\s*\d*[：:]?\s*\n/, /Sample\s+Output\s*\d*[：:]?\s*\n/i], ends),
            frameworkCode: frameworkCodes[0] || '',
            referenceCode: frameworkCodes.slice(1, 3).join('\n\n'),
            images: queryAll('img', problem).map(function (img) { return img.currentSrc || img.src; }).filter(Boolean)
        };
        return q;
    }

    function extractFunction(problem) {
        var raw = questionText(problem);
        var codes = sectionCode(problem, /函数接口定义|函数定义|Function\s+Definition/i, /输入样例|样例输入|Sample\s+Input/i);
        if (!codes.length) codes = problemCodeBlocks(problem);
        return {
            desc: beforeFirstSection(raw),
            interfaceCode: codes[0] || '',
            supportCode: codes.slice(1).join('\n\n'),
            sampleInput: sectionCode(problem, /样例输入|输入样例|Sample\s+Input/i, /样例输出|输出样例|Sample\s+Output/i).join('\n\n'),
            sampleOutput: sectionCode(problem, /样例输出|输出样例|Sample\s+Output/i, /提示|样例输入|输入样例|Sample\s+Input/i).join('\n\n'),
            images: queryAll('img', problem).map(function (img) { return img.currentSrc || img.src; }).filter(Boolean)
        };
    }

    function collectGroups(filter) {
        var inputs = queryAll('input[type="radio"], input[type="checkbox"]').filter(function (input) {
            return !(input.closest && input.closest('#pta-root')) && (!filter || filter(input));
        });
        var groups = [];
        inputs.forEach(function (input) {
            var problem = nearestProblem(input);
            var existing = groups.find(function (group) { return group.problem === problem; });
            if (existing) existing.inputs.push(input);
            else groups.push({ problem: problem, inputs: [input], done: false });
        });
        return groups.filter(function (group) { return group.inputs.length > 0; });
    }

    function selected(group) { return group.inputs.some(function (input) { return input.checked; }); }

    function parseAnswer(value) {
        var lines = String(value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
        return lines.length > 1 ? lines[lines.length - 1] : (lines[0] || '');
    }

    function normalizeAnswer(value, preserveMultiline) {
        var answer = String(value || '').trim();
        var fenced = answer.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
        if (fenced) answer = fenced[1].trim();
        if (!preserveMultiline) answer = parseAnswer(answer);
        return answer.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
    }

    function writeChoice(problem, rawAnswer, multiple) {
        var answer = normalizeAnswer(rawAnswer);
        var options = extractOptions(problem);
        if (!options) return false;
        var lower = answer.toLowerCase();
        var isTrue = /^(true|正确|对|yes|t|1)$/.test(lower);
        var isFalse = /^(false|错误|错|no|f|0)$/.test(lower);
        var wanted = [];
        if (isTrue || isFalse) {
            wanted = [isTrue ? 'T' : 'F'];
        } else {
            var chars = answer.toUpperCase().match(/[A-F]/g) || [];
            wanted = multiple ? chars : chars.slice(-1);
        }
        var changed = false;
        options.forEach(function (option) {
            var label = option.label || (option.text.match(/^\s*([A-F])/i) || [])[1];
            if (label && wanted.indexOf(label.toUpperCase()) >= 0 && option.input) { option.input.click(); changed = true; }
        });
        if (!changed && options.length === 2 && (isTrue || isFalse)) {
            var fallback = options[isTrue ? 0 : 1];
            if (fallback && fallback.input) { fallback.input.click(); changed = true; }
        }
        return changed;
    }

    function groupFillInputs() {
        var inputs = queryAll('input').filter(function (input) {
            return !/hidden|radio|checkbox|button|submit|file|password|image/i.test(input.type || '') && !editorForInput(input);
        });
        var groups = [];
        inputs.forEach(function (input) {
            var problem = nearestProblem(input);
            var existing = groups.find(function (group) { return group.problem === problem; });
            if (existing) existing.inputs.push(input);
            else groups.push({ problem: problem, inputs: [input] });
        });
        return groups;
    }

    function groupProgramFills() {
        var inputs = queryAll('.cm-widgetBuffer + span input');
        var groups = [];
        inputs.forEach(function (input) {
            var editor = editorForInput(input);
            var existing = groups.find(function (group) { return group.editor === editor; });
            if (existing) existing.inputs.push(input);
            else groups.push({ editor: editor, inputs: [input], problem: nearestProblem(input) });
        });
        return groups;
    }

    function promptFor(type, data) {
        var language = languageLabel(data.language || state.language || 'auto');
        var rule = {
            judge: '只输出一行 true 或 false。',
            choice: '只输出一个选项字母，例如 B。',
            multi_choice: '只输出正确选项字母拼接，例如 ACD。',
            fill: '只输出答案；多个空用英文竖线 | 分隔，不要解释。',
            program_fill: '严格按空的顺序输出答案，用英文竖线 | 分隔，不要解释。',
            function: '只输出可直接粘贴的函数代码，不要 markdown 代码块、解释或 main。',
            programming: '只输出完整、可运行的程序代码，不要 markdown 代码块、解释或注释。'
        }[type] || '只输出最终答案，不要解释。';
        var parts = ['【编程语言】' + language, '【题干】\n' + (data.description || '')];
        if (data.options && data.options.length) parts.push('【选项】\n' + data.options.map(function (option) { return (option.label || '') + '. ' + option.text; }).join('\n'));
        if (data.interfaceCode) parts.push('【函数接口】\n' + data.interfaceCode);
        if (data.frameworkCode) parts.push('【代码框架】\n' + data.frameworkCode);
        if (data.supportCode) parts.push('【类型与裁判参考代码】\n' + data.supportCode);
        if (data.referenceCode) parts.push('【参考代码】\n' + data.referenceCode);
        if (data.code) parts.push('【当前代码】\n' + data.code);
        if (data.input) parts.push('【输入格式】\n' + data.input);
        if (data.output) parts.push('【输出格式】\n' + data.output);
        if (data.sampleInput) parts.push('【样例输入】\n' + data.sampleInput);
        if (data.sampleOutput) parts.push('【样例输出】\n' + data.sampleOutput);
        if (data.blankCount) parts.push('【空数量】' + data.blankCount);
        parts.push('【输出要求】' + rule);
        parts.push('【答题约束】只依据以上题干、接口和代码上下文作答；不要重复题目，不要输出分析过程。');
        return parts.join('\n\n');
    }

    function baseUrl(provider) {
        var config = state.configs[provider];
        if (provider === 'mimo' && config && /^tp-/i.test(config.apiKey || '')) return 'https://token-plan-cn.xiaomimimo.com/v1';
        return PROVIDERS[provider].baseUrl;
    }

    function endpoint(provider) { return baseUrl(provider) + '/chat/completions'; }

    function modelsEndpoint(provider) { return baseUrl(provider) + '/models'; }

    function authHeaders(provider, apiKey, method) {
        var headers = method === 'GET' ? {} : { 'Content-Type': 'application/json' };
        if (PROVIDERS[provider].auth === 'api-key') headers['api-key'] = apiKey;
        else headers.Authorization = 'Bearer ' + apiKey;
        return headers;
    }

    function apiError(prefix, status, data) {
        var serverMessage = (data && data.error && (data.error.message || data.error.code)) || (data && data.message) || '请求失败';
        if (status === 401 || status === 403) return prefix + '：API Key 无效或无权限（HTTP ' + status + '）';
        if (status === 402) return prefix + '：账户余额不足（HTTP 402）';
        if (status === 429) return prefix + '：请求过于频繁（HTTP 429）';
        return prefix + ' HTTP ' + status + '：' + serverMessage;
    }

    function requestModels(provider) {
        var config = state.configs[provider];
        return new Promise(function (resolve, reject) {
            if (!config || !config.apiKey) { reject(new Error('请先填写 ' + PROVIDERS[provider].name + ' API Key')); return; }
            GM_xmlhttpRequest({
                method: 'GET', url: modelsEndpoint(provider), headers: authHeaders(provider, config.apiKey, 'GET'), timeout: 30000,
                onload: function (response) {
                    var data;
                    try { data = JSON.parse(response.responseText || '{}'); } catch (e) { reject(new Error('模型列表响应不是有效 JSON')); return; }
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(apiError('获取模型失败', response.status, data))); return;
                    }
                    var models = (Array.isArray(data.data) ? data.data : []).map(function (item) { return item && item.id; }).filter(function (id) {
                        return id && !/asr|tts|voiceclone|voicedesign/i.test(id);
                    });
                    if (!models.length) { reject(new Error('接口没有返回可用于答题的模型')); return; }
                    resolve(Array.from(new Set(models)));
                },
                onerror: function () { reject(new Error('获取模型失败：网络请求失败，请检查网络、脚本连接权限或 API Key')); },
                ontimeout: function () { reject(new Error('获取模型失败：请求超时（30 秒）')); },
                onabort: function () { reject(new Error('获取模型失败：请求被中止')); }
            });
        });
    }

    function requestAI(messages, maxTokens) {
        var provider = PROVIDERS[state.provider];
        var config = state.configs[state.provider];
        return new Promise(function (resolve, reject) {
            if (!config || !config.apiKey) { reject(new Error('请先配置 ' + provider.name + ' API Key')); return; }
            if (!config.model) { reject(new Error('请先获取并选择一个模型')); return; }
            var body = {
                model: config.model,
                messages: messages,
                temperature: 0,
                max_tokens: maxTokens || 2048,
                stream: false
            };
            var headers = authHeaders(state.provider, config.apiKey, 'POST');
            GM_xmlhttpRequest({
                method: 'POST', url: endpoint(state.provider), headers: headers,
                data: JSON.stringify(body), timeout: 120000,
                onload: function (response) {
                    var data;
                    try { data = JSON.parse(response.responseText || '{}'); } catch (e) { reject(new Error('响应不是有效 JSON')); return; }
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(apiError('AI 请求失败', response.status, data))); return;
                    }
                    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (Array.isArray(content)) content = content.map(function (item) { return item.text || ''; }).join('');
                    if (!content) {
                        reject(new Error(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.reasoning_content ? 'AI 返回为空：本次只返回了推理内容，请提高 max_tokens' : 'AI 返回为空：请检查模型是否支持当前请求'));
                        return;
                    }
                    resolve(String(content).trim());
                },
                onerror: function () { reject(new Error('AI 请求失败：网络请求失败，请检查网络、脚本连接权限或 API Key')); },
                ontimeout: function () { reject(new Error('AI 请求失败：请求超时（120 秒）')); },
                onabort: function () { reject(new Error('AI 请求失败：请求被中止')); }
            });
        });
    }

    function solveOne(type, data) {
        var system = '你是 PTA 编程题答题助手。先在内部完成严谨分析，最终严格遵守用户的输出格式。';
        var provider = PROVIDERS[state.provider], config = state.configs[state.provider];
        var userContent = promptFor(type, data);
        if (provider.supportsImages && config.images && data.images && data.images.length) {
            userContent = [{ type: 'text', text: userContent }].concat(data.images.map(function (src) {
                return { type: 'image_url', image_url: { url: src } };
            }));
        }
        return requestAI([{ role: 'system', content: system }, { role: 'user', content: userContent }], /programming|function/.test(type) ? 32768 : 2048);
    }

    function log(message, level) {
        var box = document.getElementById('pta-log');
        if (box) {
            var item = document.createElement('div');
            item.className = 'pta-log-item ' + (level || 'info');
            item.innerHTML = '<span class="pta-log-dot"></span><span>' + escapeHtml(message) + '</span>';
            box.appendChild(item); box.scrollTop = box.scrollHeight;
            var count = document.getElementById('pta-log-count');
            if (count) count.textContent = box.children.length;
        }
        console.log('[PTA Auto Solver] ' + message);
    }

    function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
    function isContinuous() { var input = document.getElementById('pta-continuous'); return input ? input.checked : state.continuous; }
    function isSkipAnswered() { var input = document.getElementById('pta-skip'); return input ? input.checked : state.skipAnswered; }

    function setProgress(label, current, total) {
        var title = document.getElementById('pta-progress-title');
        var count = document.getElementById('pta-progress-count');
        var fill = document.getElementById('pta-progress-fill');
        if (title) title.textContent = label;
        if (count) count.textContent = total ? current + ' / ' + total : '准备中';
        if (fill) fill.style.width = total ? Math.min(100, current / total * 100) + '%' : '8%';
    }

    function nextButton() {
        return queryAll('button').find(function (button) { return /下一题|下一道|next/i.test(textOf(button)) && !button.disabled; });
    }

    function goNext() { var button = nextButton(); if (button) { button.click(); return true; } return false; }
    function lastPage() { return !nextButton() || /完成考试|提交试卷|考试结束|查看成绩/.test(textOf(document.body)); }

    function questionProgress() {
        var typeMatch = location.pathname.match(/\/exam\/problems\/type\/(\d+)/);
        var currentMatch = location.href.match(/[?&]problemSetProblemId=([^&#]+)/);
        var currentId = currentMatch ? decodeURIComponent(currentMatch[1]) : '';
        var ids = queryAll('a').map(function (link) {
            var href = link.href || link.getAttribute('href') || '';
            var match = href.match(/\/exam\/problems\/type\/(\d+)[?&]problemSetProblemId=([^&#]+)/);
            return match && (!typeMatch || match[1] === typeMatch[1]) ? decodeURIComponent(match[2]) : '';
        }).filter(Boolean).filter(function (id, index, list) { return list.indexOf(id) === index; });
        var current = currentId ? ids.indexOf(currentId) + 1 : 0;
        if (current > 0 && ids.length > 0) return { current: current, total: ids.length };
        var summary = textOf(document.body).match(/(?:函数题|编程题|多文件编程题)\s*(\d+)\s*\/\s*(\d+)/);
        return summary ? { current: Number(summary[1]), total: Number(summary[2]) } : null;
    }

    function setQuestionProgress(label, fallbackCurrent, fallbackTotal) {
        var progress = questionProgress();
        setProgress(label, progress ? progress.current : (fallbackCurrent || 0), progress ? progress.total : (fallbackTotal || 0));
    }

    function submitButton() {
        return queryAll('button').find(function (button) {
            return !button.disabled && /提交本题作答|提交代码/.test(textOf(button));
        });
    }

    function lastSubmissionButton() {
        return queryAll('button').find(function (button) { return !button.disabled && /查看上次提交/.test(textOf(button)); });
    }

    function readSubmissionScore() {
        var body = textOf(document.body);
        if (!/提交结果/.test(body)) return null;
        var match = body.match(/(?:分数|得分)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        if (!match) return null;
        return { score: Number(match[1]), total: Number(match[2]) };
    }

    function closeSubmissionResult() {
        if (!/提交结果/.test(textOf(document.body))) return false;
        var close = queryAll('button').find(function (button) { return /^(确认|关闭|返回)$/.test(textOf(button)); });
        if (close) { close.click(); return true; }
        return false;
    }

    async function waitForSubmitButton(timeout) {
        var deadline = Date.now() + (timeout || 6000);
        while (Date.now() < deadline && state.running) {
            var button = submitButton();
            if (button) return button;
            await sleep(250);
        }
        return null;
    }

    async function waitForSubmissionScore(timeout) {
        var started = Date.now();
        var deadline = started + (timeout || 45000);
        var openedResult = false;
        while (Date.now() < deadline && state.running) {
            var score = readSubmissionScore();
            if (score) return score;
            if (!openedResult && Date.now() - started >= 1800) {
                var view = lastSubmissionButton();
                if (view) { view.click(); openedResult = true; await sleep(500); }
            }
            await sleep(800);
        }
        return null;
    }

    async function solveChoicePage(type) {
        var multiple = type === 'multi_choice';
        var groups = collectGroups(function (input) {
            var label = input.closest('label');
            return !label || !/^(T|F|正确|错误)\b/i.test(textOf(label));
        });
        if (!groups.length) return 0;
        var done = 0;
        for (var i = 0; i < groups.length && state.running; i++) {
            var group = groups[i];
            if (isSkipAnswered() && selected(group)) continue;
            group.problem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setQuestionProgress(multiple ? '多选题' : '单选题', i + 1, groups.length);
            await sleep(250);
            var options = extractOptions(group.problem);
            var answer = await solveOne(type, { description: questionText(group.problem), options: options, images: problemImages(group.problem), language: state.language });
            if (writeChoice(group.problem, answer, multiple)) { done++; log('第 ' + (i + 1) + ' 题已写入', 'success'); }
            else log('第 ' + (i + 1) + ' 题未找到对应选项', 'warning');
        }
        return done;
    }

    async function solveJudgePage() {
        var groups = collectGroups(function (input) {
            var label = input.closest('label');
            return !label || /^(T|F|正确|错误)\b/i.test(textOf(label));
        });
        if (!groups.length) return 0;
        var done = 0;
        for (var i = 0; i < groups.length && state.running; i++) {
            var group = groups[i];
            if (isSkipAnswered() && selected(group)) continue;
            group.problem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setQuestionProgress('判断题', i + 1, groups.length);
            await sleep(250);
            var answer = await solveOne('judge', { description: questionText(group.problem), options: extractOptions(group.problem), images: problemImages(group.problem), language: state.language });
            if (writeChoice(group.problem, answer, false)) { done++; log('第 ' + (i + 1) + ' 题已写入', 'success'); }
            else log('第 ' + (i + 1) + ' 题未找到判断选项', 'warning');
        }
        return done;
    }

    async function solveFillPage() {
        var groups = groupFillInputs().filter(function (group) { return group.inputs.some(function (input) { return !input.value.trim(); }); });
        if (!groups.length) return 0;
        var done = 0;
        for (var i = 0; i < groups.length && state.running; i++) {
            var group = groups[i], blanks = group.inputs.filter(function (input) { return !input.value.trim(); });
            if (!blanks.length) continue;
            group.problem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setQuestionProgress('填空题', i + 1, groups.length);
            var answer = await solveOne('fill', { description: questionText(group.problem), blankCount: blanks.length, images: problemImages(group.problem), language: state.language });
            var values = normalizeAnswer(answer).split('|').map(function (value) { return value.trim(); });
            blanks.forEach(function (input, index) { if (writeInput(input, values[index] || values[0] || '')) done++; });
            log('填空组 ' + (i + 1) + ' 已写入', 'success');
        }
        return done;
    }

    async function solveProgramFillPage() {
        var groups = groupProgramFills().filter(function (group) { return group.inputs.some(function (input) { return !input.value.trim(); }); });
        if (!groups.length) return 0;
        var done = 0;
        for (var i = 0; i < groups.length && state.running; i++) {
            var group = groups[i], code = getEditorDoc(group.editor), blanks = group.inputs.filter(function (input) { return !input.value.trim(); });
            var marked = code.replace(/______+/g, function () { return '【空】'; });
            var answer = await solveOne('program_fill', { description: questionText(group.problem), code: marked, blankCount: blanks.length, images: problemImages(group.problem), language: resolveLanguage(code, state.language) });
            var values = normalizeAnswer(answer).split('|').map(function (value) { return value.trim(); });
            blanks.forEach(function (input, index) { if (writeInput(input, values[index] || values[0] || '')) done++; });
            setQuestionProgress('程序填空', i + 1, groups.length);
            log('程序填空组 ' + (i + 1) + ' 已写入', 'success');
        }
        return done;
    }

    async function submitCode(type) {
        var problem = queryAll('.rendered-markdown')[0] || document.querySelector('section');
        if (!problem) return { processed: 0, fullScore: false };
        setQuestionProgress('读取题目', 1, 1);
        closeSubmissionResult();
        var question = type === 'programming' ? extractProgramming(problem) : extractFunction(problem);
        var attempts = 0;
        var editor = null;

        while (attempts < 2 && state.running) {
            setQuestionProgress(attempts ? '第 2 次生成答案' : '生成答案', 1, 1);
            if (!editor || !document.documentElement.contains(editor)) editor = editableEditor(attempts === 0 && isSkipAnswered());
            if (!editor) {
                if (attempts === 0 && isSkipAnswered()) { setQuestionProgress('已跳过', 1, 1); log('当前题已有答案，已跳过', 'info'); return { processed: 0, fullScore: false }; }
                log('未找到可写代码编辑器', 'warning');
                return { processed: 0, fullScore: false };
            }
            var code = getEditorDoc(editor);
            var answer = await solveOne(type, {
                description: question.desc || questionText(problem), code: code,
                interfaceCode: question.interfaceCode,
                supportCode: question.supportCode,
                frameworkCode: question.frameworkCode,
                referenceCode: question.referenceCode,
                input: question.input, output: question.output, sampleInput: question.sampleInput, sampleOutput: question.sampleOutput,
                images: question.images || problemImages(problem), language: resolveLanguage([question.interfaceCode, question.frameworkCode, question.supportCode, question.referenceCode, code].filter(Boolean).join('\n'), state.language)
            });
            if (!writeEditor(editor, normalizeAnswer(answer, true))) { log('代码已复制，请在编辑器中手动粘贴', 'warning'); return { processed: 0, fullScore: false }; }
            setQuestionProgress(attempts ? '第 2 次准备提交' : '准备提交', 1, 1);
            log(attempts ? '第 2 次代码已写入编辑器' : '代码已写入编辑器', 'success');

            var submit = await waitForSubmitButton(6000);
            if (!submit) { log('未找到可点击的“提交本题作答”按钮', 'warning'); return { processed: 1, fullScore: false }; }
            await sleep(400);
            submit.click();
            log(attempts ? '已提交第 2 次答案，等待评分' : '已点击提交，等待程序评分', 'info');
            setQuestionProgress('等待评分', 1, 1);
            setStatus('正在评分', '等待 PTA 程序评测…', 'live');
            var result = await waitForSubmissionScore(45000);
            if (!result) { log('等待评分超时，未自动重复提交', 'warning'); return { processed: 1, fullScore: false }; }

            var fullScore = result.total > 0 && result.score >= result.total;
            log('本题得分 ' + result.score + ' / ' + result.total + (fullScore ? '，满分' : '，未满分'), fullScore ? 'success' : 'warning');
            closeSubmissionResult();
            if (fullScore) {
                setQuestionProgress('满分通过', 1, 1);
                setStatus('满分通过', result.score + ' / ' + result.total, 'ok');
                return { processed: 1, fullScore: true };
            }
            attempts++;
            if (attempts < 2 && state.running) {
                setQuestionProgress('准备重答', 1, 1);
                log('本题未满分，重新作答（最多重试 1 次）', 'info');
                await sleep(700);
            }
        }
        return { processed: 1, fullScore: false };
    }

    async function autoSolve() {
        var type = detectType();
        setQuestionProgress('准备处理', 1, 1);
        log('识别为' + (type === 'unknown' ? '未知题型' : ' ' + type) + '，语言 ' + languageLabel(state.language) + '，使用 ' + PROVIDERS[state.provider].name, 'info');
        if (type === 'unknown') { log('当前页面未识别到题型，请进入具体题目页面', 'warning'); return; }
        var total = 0;
        do {
            if (!state.running) break;
            if (type === 'judge') total += await solveJudgePage();
            else if (type === 'choice' || type === 'multi_choice') total += await solveChoicePage(type);
            else if (type === 'fill') total += await solveFillPage();
            else if (type === 'program_fill') total += await solveProgramFillPage();
            else if (type === 'function' || type === 'programming') {
                var codeResult = await submitCode(type);
                total += codeResult.processed;
                if (!codeResult.fullScore || !isContinuous() || lastPage() || !goNext()) break;
                log('本题满分，进入下一题', 'success');
                await sleep(1200);
                setQuestionProgress('读取下一题', 1, 1);
                continue;
            }
            if (!isContinuous() || lastPage() || !goNext()) break;
            await sleep(900);
        } while (state.running);
        log('本次完成，共处理 ' + total + ' 题/空', 'success');
    }

    var CSS = `
    #pta-root{--pta-bg:#fff;--pta-panel:#f8f9fc;--pta-text:#17181c;--pta-muted:#737782;--pta-line:#e7e9ee;--pta-accent:#635bff;--pta-accent-soft:#eeedff;--pta-success:#219653;--pta-warn:#b7791f;position:fixed;right:22px;bottom:22px;z-index:2147483000;font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--pta-text)}
    #pta-root *{box-sizing:border-box}#pta-shell{width:390px;border:1px solid rgba(20,24,40,.12);border-radius:18px;background:var(--pta-bg);box-shadow:0 18px 55px rgba(22,24,40,.18),0 3px 12px rgba(22,24,40,.08);overflow:hidden;transition:width .38s cubic-bezier(.16,1,.3,1),max-height .42s cubic-bezier(.16,1,.3,1),border-radius .38s ease}
    #pta-shell.collapsed{width:58px;height:58px;border-radius:19px;cursor:pointer}#pta-shell.collapsed .pta-expanded{display:none}#pta-shell.collapsed .pta-brand{padding:0;justify-content:center;gap:0}#pta-shell.collapsed .pta-brand-copy,#pta-shell.collapsed .pta-top-actions{display:none}#pta-shell.collapsed .pta-collapsed-mark{display:block}
    .pta-top{height:62px;display:flex;align-items:center;padding:0 14px;border-bottom:1px solid var(--pta-line);background:linear-gradient(135deg,#fff 0%,#f7f7ff 100%)}.pta-brand{display:flex;align-items:center;gap:0;flex:1;min-width:0}.pta-collapsed-mark{display:none;width:24px;height:4px;border-radius:99px;background:#111}.pta-brand-copy{min-width:0}.pta-brand-title{font-weight:700;letter-spacing:-.2px}.pta-brand-meta{font-size:11px;color:var(--pta-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pta-top-actions{display:flex;gap:5px}.pta-icon-btn,.pta-link-btn{border:0;background:transparent;color:var(--pta-muted);cursor:pointer;border-radius:8px;padding:7px;transition:transform .2s ease,background .2s ease,color .2s ease}.pta-icon-btn:hover,.pta-link-btn:hover{background:var(--pta-accent-soft);color:var(--pta-accent);transform:translateY(-1px)}
    .pta-expanded{padding:13px 14px 14px}.pta-status{display:flex;align-items:center;gap:8px;padding:10px 11px;border-radius:12px;background:var(--pta-panel);border:1px solid var(--pta-line);margin-bottom:12px}.pta-status-dot{width:8px;height:8px;border-radius:50%;background:var(--pta-muted)}.pta-status-dot.live{background:var(--pta-accent);box-shadow:0 0 0 5px var(--pta-accent-soft);animation:pta-breathe 1.8s ease-in-out infinite}.pta-status-dot.ok{background:var(--pta-success)}.pta-status-text{flex:1}.pta-status-label{font-weight:600}.pta-status-sub{font-size:11px;color:var(--pta-muted);margin-top:1px}.pta-progress{margin:12px 2px 15px}.pta-progress-head{display:flex;justify-content:space-between;color:var(--pta-muted);font-size:11px;margin-bottom:7px}.pta-progress-head strong{color:var(--pta-text);font-weight:600}.pta-progress-track{height:5px;border-radius:99px;background:#eceef3;overflow:hidden}.pta-progress-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#8178ff,#5149dc);transition:width .38s ease}.pta-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:13px}.pta-check{display:flex;align-items:center;gap:7px;color:var(--pta-muted);font-size:12px;cursor:pointer}.pta-check input{accent-color:var(--pta-accent)}.pta-primary{width:100%;height:42px;border:0;border-radius:11px;background:var(--pta-accent);color:#fff;font:600 13px inherit;cursor:pointer;box-shadow:0 7px 16px rgba(99,91,255,.23);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}.pta-primary:hover{transform:translateY(-1px);box-shadow:0 10px 19px rgba(99,91,255,.28)}.pta-primary:active{transform:scale(.98)}.pta-primary.stop{background:#d84c5b;box-shadow:0 7px 16px rgba(216,76,91,.2)}.pta-log-head{display:flex;align-items:center;margin:16px 1px 7px;color:var(--pta-muted);font-size:11px}.pta-log-head strong{color:var(--pta-text);font-weight:600;margin-right:5px}.pta-log-clear{margin-left:auto;padding:0}.pta-log{height:108px;border-top:1px solid var(--pta-line);padding-top:5px;overflow:auto;scrollbar-width:thin}.pta-log-item{display:flex;align-items:flex-start;gap:7px;padding:4px 2px;color:var(--pta-muted);font-size:11px;animation:pta-rise .25s ease both}.pta-log-item.success{color:var(--pta-success)}.pta-log-item.warning{color:var(--pta-warn)}.pta-log-dot{width:5px;height:5px;border-radius:50%;background:currentColor;margin-top:6px;flex:0 0 auto}.pta-empty{color:#a4a8b0;padding:10px 2px}.pta-drawer{position:absolute;inset:0;background:var(--pta-bg);transform:translateX(104%);transition:transform .42s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column}.pta-drawer.open{transform:translateX(0)}.pta-drawer-head{height:62px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid var(--pta-line)}.pta-drawer-title{font-weight:700;flex:1}.pta-drawer-body{padding:14px;overflow:auto}.pta-tabs{display:grid;grid-template-columns:1fr 1fr;background:var(--pta-panel);border-radius:10px;padding:3px;margin-bottom:15px}.pta-tab{border:0;background:transparent;color:var(--pta-muted);border-radius:8px;padding:8px;cursor:pointer;font:600 12px inherit}.pta-tab.active{background:#fff;color:var(--pta-text);box-shadow:0 1px 4px rgba(22,24,40,.1)}.pta-pane{display:none}.pta-pane.active{display:block;animation:pta-rise .25s ease both}.pta-provider{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}.pta-provider-card{padding:11px;border:1px solid var(--pta-line);border-radius:11px;text-align:left;background:#fff;cursor:pointer;transition:border .2s ease,background .2s ease,transform .2s ease}.pta-provider-card:hover{transform:translateY(-1px)}.pta-provider-card.active{border-color:var(--pta-accent);background:var(--pta-accent-soft)}.pta-provider-name{font-weight:700}.pta-provider-hint{display:block;color:var(--pta-muted);font-size:10px;margin-top:3px}.pta-field{margin:12px 0}.pta-field label{display:block;font-size:11px;font-weight:600;color:var(--pta-muted);margin-bottom:6px}.pta-field input,.pta-field select{width:100%;height:36px;border:1px solid var(--pta-line);border-radius:9px;padding:0 10px;outline:none;background:#fff;color:var(--pta-text);font:12px inherit}.pta-field input:focus,.pta-field select:focus{border-color:var(--pta-accent);box-shadow:0 0 0 3px var(--pta-accent-soft)}.pta-fixed{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;border-radius:10px;background:var(--pta-panel);color:var(--pta-muted);font-size:11px}.pta-fixed strong{color:var(--pta-text);font-weight:600}.pta-save{width:100%;height:37px;margin-top:6px;border:0;border-radius:9px;background:var(--pta-text);color:#fff;cursor:pointer;font:600 12px inherit}.pta-help{font-size:11px;line-height:1.7;color:var(--pta-muted);margin:12px 1px}.pta-switch-row{display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--pta-line);border-radius:11px}.pta-switch{position:relative;width:38px;height:22px}.pta-switch input{opacity:0;width:0;height:0}.pta-slider{position:absolute;inset:0;border-radius:99px;background:#d9dce4;cursor:pointer;transition:.2s}.pta-slider:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:.2s}.pta-switch input:checked+.pta-slider{background:var(--pta-accent)}.pta-switch input:checked+.pta-slider:before{transform:translateX(16px)}.pta-toast{position:fixed;right:22px;bottom:92px;z-index:2147483001;padding:10px 13px;border-radius:10px;background:#1b1d23;color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.18);animation:pta-toast-in .25s ease both}.pta-toast.out{animation:pta-toast-out .25s ease both}@keyframes pta-breathe{50%{opacity:.55;transform:scale(.85)}}@keyframes pta-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes pta-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes pta-toast-out{to{opacity:0;transform:translateY(8px)}}
    @media(max-width:600px){#pta-root{right:12px;bottom:12px}#pta-shell{width:min(390px,calc(100vw - 24px))}}
    #pta-root{--pta-bg:rgba(255,255,255,.84);--pta-panel:rgba(246,246,246,.72);--pta-text:#101010;--pta-muted:#777;--pta-line:rgba(0,0,0,.12);--pta-accent:#111;--pta-accent-soft:rgba(0,0,0,.07);--pta-success:#111;--pta-warn:#444}
    #pta-shell,.pta-drawer{background:var(--pta-bg);backdrop-filter:blur(24px) saturate(105%);-webkit-backdrop-filter:blur(24px) saturate(105%)}
    #pta-shell{border-color:rgba(0,0,0,.14);box-shadow:0 22px 65px rgba(0,0,0,.14),0 3px 12px rgba(0,0,0,.06)}
    .pta-top{background:rgba(255,255,255,.58);border-bottom-color:rgba(0,0,0,.1)}
    .pta-primary{background:#111;box-shadow:0 8px 18px rgba(0,0,0,.16)}.pta-progress-fill{background:#111}.pta-primary.stop{background:#444;box-shadow:0 8px 18px rgba(0,0,0,.12)}
    .pta-status{border-color:rgba(0,0,0,.1)}.pta-status-dot.live{background:#111;box-shadow:0 0 0 5px rgba(0,0,0,.08)}
    .pta-provider-card{background:rgba(255,255,255,.4);border-color:rgba(0,0,0,.12);transition:border-color .2s ease,background .2s ease,transform .2s cubic-bezier(.22,1,.36,1)}.pta-provider-card.active{border-color:#111;background:rgba(0,0,0,.06)}.pta-home-language{margin:0 1px 13px;padding:10px 11px;border:1px solid rgba(0,0,0,.1);border-radius:11px;background:rgba(245,245,245,.52)}.pta-home-language-head{display:flex;align-items:center;justify-content:space-between;color:#555;font-size:11px;font-weight:600}.pta-home-language-head span:last-child{color:#888;font-weight:500}.pta-home-language .pta-model-select{margin-top:7px}
    html.pta-theme-dark{color-scheme:dark;background:#101114}html.pta-theme-dark body{background:#101114!important;color:#ededed!important}html.pta-theme-dark body>*:not(#pta-root){filter:invert(1) hue-rotate(180deg)}html.pta-theme-dark body>*:not(#pta-root) img,html.pta-theme-dark body>*:not(#pta-root) video{filter:invert(1) hue-rotate(180deg)}html.pta-theme-dark #pta-root{--pta-bg:rgba(24,24,26,.9);--pta-panel:rgba(42,42,45,.76);--pta-text:#f5f5f5;--pta-muted:#a5a5aa;--pta-line:rgba(255,255,255,.15);--pta-accent:#f5f5f5;--pta-accent-soft:rgba(255,255,255,.1);--pta-success:#f5f5f5;--pta-warn:#d4d4d4}html.pta-theme-dark #pta-shell,html.pta-theme-dark .pta-drawer{background:var(--pta-bg);color:var(--pta-text)}html.pta-theme-dark .pta-top{background:rgba(28,28,30,.72);border-bottom-color:var(--pta-line)}html.pta-theme-dark .pta-status,html.pta-theme-dark .pta-fixed{background:rgba(42,42,45,.64);border-color:var(--pta-line)}html.pta-theme-dark .pta-select-trigger{background:rgba(38,38,41,.78);color:var(--pta-text);border-color:var(--pta-line)}html.pta-theme-dark .pta-select-trigger:hover,html.pta-theme-dark .pta-model-select.open .pta-select-trigger{background:#303034;border-color:#f5f5f5}html.pta-theme-dark .pta-select-menu{background:rgba(32,32,35,.96);border-color:var(--pta-line)}html.pta-theme-dark .pta-select-option{color:#d4d4d8}html.pta-theme-dark .pta-select-option:hover,html.pta-theme-dark .pta-select-option.active{background:#f5f5f5;color:#111}
    html.pta-theme-dark .pta-field input,html.pta-theme-dark .pta-field select{background:rgba(255,255,255,.065);border-color:rgba(255,255,255,.16);color:#f5f5f5;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}html.pta-theme-dark .pta-field input::placeholder{color:#8f8f96}html.pta-theme-dark .pta-field input:focus,html.pta-theme-dark .pta-field select:focus{background:rgba(255,255,255,.1);border-color:#f5f5f5;box-shadow:0 0 0 3px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.06)}html.pta-theme-dark .pta-select-trigger{background:rgba(255,255,255,.065);border-color:rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}html.pta-theme-dark .pta-select-trigger:hover,html.pta-theme-dark .pta-model-select.open .pta-select-trigger{background:rgba(255,255,255,.12);border-color:#f5f5f5;box-shadow:0 0 0 3px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.06)}html.pta-theme-dark .pta-select-menu{background:rgba(26,26,29,.97);border-color:rgba(255,255,255,.16);box-shadow:0 18px 38px rgba(0,0,0,.38)}html.pta-theme-dark .pta-select-option{color:#d9d9de}html.pta-theme-dark .pta-select-option:hover,html.pta-theme-dark .pta-select-option.active{background:#f5f5f5;color:#111}html.pta-theme-dark .pta-select-option[aria-disabled="true"]{color:#77777f}html.pta-theme-dark .pta-provider-card{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.14);color:#f5f5f5}html.pta-theme-dark .pta-provider-card.active{background:rgba(255,255,255,.13);border-color:#f5f5f5}html.pta-theme-dark .pta-tabs{background:rgba(255,255,255,.07)}html.pta-theme-dark .pta-tab{color:#aaaab2}html.pta-theme-dark .pta-tab.active{background:#f5f5f5;color:#111;box-shadow:0 1px 6px rgba(0,0,0,.28)}html.pta-theme-dark .pta-save{background:#f5f5f5;color:#111}html.pta-theme-dark .pta-secondary{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#f5f5f5}html.pta-theme-dark .pta-secondary:hover{background:#f5f5f5;color:#111}html.pta-theme-dark .pta-home-language{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.14)}html.pta-theme-dark .pta-home-language-head{color:#d0d0d5}html.pta-theme-dark .pta-home-language-head span:last-child{color:#9999a2}
    .pta-secondary{height:32px;border:1px solid var(--pta-line);border-radius:8px;background:rgba(255,255,255,.52);color:var(--pta-text);padding:0 11px;cursor:pointer;font:600 11px inherit;transition:background .2s ease,color .2s ease,transform .2s ease}.pta-secondary:hover{background:#111;color:#fff;transform:translateY(-1px)}.pta-drawer-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.pta-image-option{display:flex;align-items:center;gap:6px;color:var(--pta-muted);font-size:11px}.pta-image-option input{accent-color:#111}.pta-fixed,.pta-status{background:rgba(245,245,245,.6)}.pta-toast{background:#111}.pta-icon-btn:hover,.pta-link-btn:hover{background:rgba(0,0,0,.08);color:#111}.pta-error{color:#333!important;font-weight:600}
    .pta-model-select{position:relative}.pta-model-native{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.pta-select-trigger{width:100%;height:38px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--pta-line);border-radius:10px;padding:0 11px;background:rgba(255,255,255,.56);color:var(--pta-text);font:12px inherit;text-align:left;cursor:pointer;transition:border-color .2s ease,background .2s ease,box-shadow .2s ease}.pta-select-trigger:hover,.pta-model-select.open .pta-select-trigger{border-color:#111;background:#fff}.pta-model-select.open .pta-select-trigger{box-shadow:0 0 0 3px rgba(0,0,0,.06)}.pta-select-trigger:disabled{cursor:not-allowed;opacity:.55}.pta-select-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pta-select-chevron{width:7px;height:7px;flex:0 0 auto;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .24s cubic-bezier(.22,1,.36,1)}.pta-model-select.open .pta-select-chevron{transform:rotate(225deg) translate(-1px,-2px)}.pta-select-menu{position:absolute;left:0;right:0;top:calc(100% + 7px);z-index:20;padding:4px;border:1px solid rgba(0,0,0,.12);border-radius:11px;background:rgba(255,255,255,.92);box-shadow:0 14px 32px rgba(0,0,0,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.985);transform-origin:top center;transition:opacity .2s ease,transform .24s cubic-bezier(.22,1,.36,1),visibility 0s linear .24s;max-height:176px;overflow:auto}.pta-model-select.open .pta-select-menu{opacity:1;visibility:visible;transform:none;transition-delay:0s}.pta-select-option{display:flex;align-items:center;min-height:32px;padding:0 9px;border-radius:7px;color:#555;font-size:12px;cursor:pointer;opacity:0;transform:translateY(-3px);transition:background .16s ease,color .16s ease,opacity .2s ease,transform .24s cubic-bezier(.22,1,.36,1)}.pta-model-select.open .pta-select-option{opacity:1;transform:none;transition-delay:calc(var(--option-index,0) * 22ms)}.pta-select-option:hover,.pta-select-option.active{background:#111;color:#fff}.pta-select-option[aria-disabled="true"]{color:#999;cursor:default}.pta-select-option[aria-disabled="true"]:hover{background:transparent;color:#999}
    .pta-model-select.closing .pta-select-menu{opacity:0;visibility:visible;transform:translateY(-4px) scale(.985);transition:opacity .15s ease,transform .17s cubic-bezier(.4,0,.2,1),visibility 0s linear .17s}.pta-model-select.closing .pta-select-option{opacity:0;transform:translateY(-2px);transition-delay:calc(var(--option-index,0) * 8ms)}
    @media(prefers-reduced-motion:reduce){#pta-shell,.pta-drawer,.pta-select-menu,.pta-select-option,.pta-select-chevron,.pta-primary,.pta-secondary{transition-duration:.01ms!important;animation-duration:.01ms!important}}
    `;

    function toast(message) {
        var old = document.querySelector('.pta-toast'); if (old) old.remove();
        var item = document.createElement('div'); item.className = 'pta-toast'; item.textContent = message; document.body.appendChild(item);
        setTimeout(function () { item.classList.add('out'); setTimeout(function () { item.remove(); }, 250); }, 2200);
    }

    function render() {
        if (document.getElementById('pta-root')) return;
        var style = document.createElement('style'); style.id = 'pta-style'; style.textContent = CSS; document.head.appendChild(style);
        var root = document.createElement('div'); root.id = 'pta-root';
        root.innerHTML = `
            <div id="pta-shell" class="collapsed">
                <div class="pta-top">
                    <div class="pta-brand"><div class="pta-collapsed-mark" aria-hidden="true"></div><div class="pta-brand-copy"><div class="pta-brand-title">PTA Solver</div><div class="pta-brand-meta" id="pta-meta">未配置 AI</div></div></div>
                    <div class="pta-top-actions"><button class="pta-icon-btn" id="pta-theme-toggle" title="切换深色" aria-label="切换深色">☾</button><button class="pta-icon-btn" id="pta-settings" title="设置">⚙</button><button class="pta-icon-btn" id="pta-collapse" title="收起">×</button></div>
                </div>
                <div class="pta-expanded">
                    <div class="pta-status"><span class="pta-status-dot" id="pta-status-dot"></span><div class="pta-status-text"><div class="pta-status-label" id="pta-status-label">准备就绪</div><div class="pta-status-sub" id="pta-status-sub">进入题目后开始</div></div><button class="pta-link-btn" id="pta-test">测试</button></div>
                    <div class="pta-progress"><div class="pta-progress-head"><strong id="pta-progress-title">等待开始</strong><span id="pta-progress-count">—</span></div><div class="pta-progress-track"><div class="pta-progress-fill" id="pta-progress-fill"></div></div></div>
                    <div class="pta-home-language"><div class="pta-home-language-head"><span>编程语言</span><span id="pta-language-mode">自动检测</span></div><div class="pta-model-select" id="pta-language-select"><select id="pta-language" class="pta-model-native" tabindex="-1" aria-hidden="true"><option value="auto">自动检测</option><option value="c">C</option><option value="cpp">C++</option><option value="python">Python</option><option value="java">Java</option><option value="pascal">Pascal</option></select><button type="button" class="pta-select-trigger" id="pta-language-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="pta-select-value" id="pta-language-value">自动检测</span><span class="pta-select-chevron" aria-hidden="true"></span></button><div class="pta-select-menu" id="pta-language-menu" role="listbox"></div></div></div>
                    <div class="pta-options"><label class="pta-check"><input id="pta-skip" type="checkbox" checked>跳过已作答</label><label class="pta-check"><input id="pta-continuous" type="checkbox" checked>连续下一题</label></div>
                    <button id="pta-start" class="pta-primary">开始解题</button>
                    <div class="pta-log-head"><strong>运行记录</strong><span id="pta-log-count">0</span><button id="pta-log-clear" class="pta-link-btn pta-log-clear">清空</button></div>
                    <div id="pta-log" class="pta-log"><div class="pta-empty">准备接收任务…</div></div>
                </div>
                <div id="pta-drawer" class="pta-drawer">
                    <div class="pta-drawer-head"><button id="pta-drawer-close" class="pta-icon-btn">‹</button><div class="pta-drawer-title">设置</div><button id="pta-drawer-save" class="pta-save" style="width:auto;padding:0 12px;margin:0">保存</button></div>
                    <div class="pta-drawer-body">
                        <div class="pta-provider"><button class="pta-provider-card active" data-provider="deepseek"><span class="pta-provider-name">DeepSeek</span><span class="pta-provider-hint">文字 / 代码</span></button><button class="pta-provider-card" data-provider="mimo"><span class="pta-provider-name">MiMo</span><span class="pta-provider-hint">推理 / 图片</span></button></div>
                        <div class="pta-fixed"><span>接口地址</span><strong id="pta-endpoint">api.deepseek.com/v1</strong></div>
                        <div class="pta-field"><label>API Key</label><input id="pta-api-key" type="password" autocomplete="off" placeholder="填写后自动读取模型列表"></div>
                        <div class="pta-field"><label>可用模型</label><div class="pta-model-select" id="pta-model-select"><select id="pta-model" class="pta-model-native" tabindex="-1" aria-hidden="true" disabled><option value="">填写 API Key 后获取</option></select><button type="button" class="pta-select-trigger" id="pta-model-trigger" aria-haspopup="listbox" aria-expanded="false" disabled><span class="pta-select-value" id="pta-model-value">填写 API Key 后获取</span><span class="pta-select-chevron" aria-hidden="true"></span></button><div class="pta-select-menu" id="pta-model-menu" role="listbox"></div></div><div id="pta-model-state" class="pta-help">模型由供应商接口实时返回。</div></div>
                        <div class="pta-drawer-actions"><button id="pta-refresh-models" class="pta-secondary">刷新模型</button><label class="pta-image-option"><input id="pta-images" type="checkbox">允许发送题目图片</label></div>
                        <div class="pta-help">Key 只保存在当前浏览器本地。MiMo 默认开启图片输入；DeepSeek 默认关闭。图片会随题目请求发送给所选供应商。</div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(root);
        bindUI(root);
        syncUI();
    }

    function closeModelDropdown() {
        document.querySelectorAll('.pta-model-select.open').forEach(function (wrapper) {
            wrapper.classList.remove('open');
            wrapper.classList.add('closing');
            clearTimeout(wrapper._ptaCloseTimer);
            wrapper._ptaCloseTimer = setTimeout(function () { wrapper.classList.remove('closing'); }, 190);
        });
        document.querySelectorAll('.pta-select-trigger[aria-expanded="true"]').forEach(function (trigger) { trigger.setAttribute('aria-expanded', 'false'); });
    }

    function syncDropdown(nativeId, wrapperId, triggerId, valueId, menuId) {
        var native = document.getElementById(nativeId);
        var wrapper = document.getElementById(wrapperId);
        var trigger = document.getElementById(triggerId);
        var value = document.getElementById(valueId);
        var menu = document.getElementById(menuId);
        if (!native || !wrapper || !trigger || !value || !menu) return;

        trigger.disabled = native.disabled;
        trigger.setAttribute('aria-expanded', wrapper.classList.contains('open') ? 'true' : 'false');
        value.textContent = native.options[native.selectedIndex] ? native.options[native.selectedIndex].textContent : '填写 API Key 后获取';
        menu.innerHTML = '';
        Array.prototype.slice.call(native.options).forEach(function (option, index) {
            var item = document.createElement('div');
            item.className = 'pta-select-option' + (option.value && option.value === native.value ? ' active' : '');
            item.style.setProperty('--option-index', index);
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', option.value === native.value ? 'true' : 'false');
            item.textContent = option.textContent;
            if (!option.value) item.setAttribute('aria-disabled', 'true');
            item.addEventListener('click', function (event) {
                event.stopPropagation();
                if (!option.value || native.disabled) return;
                native.value = option.value;
                native.dispatchEvent(new Event('change', { bubbles: true }));
                closeModelDropdown();
            });
            menu.appendChild(item);
        });
        if (native.disabled) closeModelDropdown();
    }

    function syncModelDropdown() { syncDropdown('pta-model', 'pta-model-select', 'pta-model-trigger', 'pta-model-value', 'pta-model-menu'); }
    function syncLanguageDropdown() { syncDropdown('pta-language', 'pta-language-select', 'pta-language-trigger', 'pta-language-value', 'pta-language-menu'); }

    function applyTheme() {
        var dark = state.theme === 'dark';
        document.documentElement.classList.toggle('pta-theme-dark', dark);
        var button = document.getElementById('pta-theme-toggle');
        if (button) {
            button.textContent = dark ? '☀' : '☾';
            button.title = dark ? '切换浅色' : '切换深色';
            button.setAttribute('aria-label', dark ? '切换浅色' : '切换深色');
        }
    }

    function syncUI() {
        applyTheme();
        var provider = PROVIDERS[state.provider], config = state.configs[state.provider];
        var meta = document.getElementById('pta-meta'); if (meta) meta.textContent = config.apiKey ? provider.name + ' · ' + (config.model || '等待模型') : '未配置 AI';
        var key = document.getElementById('pta-api-key'); if (key) key.value = config.apiKey || '';
        var model = document.getElementById('pta-model');
        if (model) {
            model.innerHTML = '';
            if (!config.models || !config.models.length) {
                var placeholder = document.createElement('option');
                placeholder.value = ''; placeholder.textContent = config.apiKey ? '正在等待模型列表…' : '填写 API Key 后获取';
                model.appendChild(placeholder); model.disabled = true;
            } else {
                config.models.forEach(function (id) {
                    var option = document.createElement('option'); option.value = id; option.textContent = id; model.appendChild(option);
                });
                model.value = config.model || config.models[0]; model.disabled = false;
            }
        }
        syncModelDropdown();
        var language = document.getElementById('pta-language'); if (language) language.value = state.language || 'auto';
        syncLanguageDropdown();
        var modelState = document.getElementById('pta-model-state'); if (modelState) { modelState.textContent = config.modelsLoading ? '正在向供应商读取模型列表…' : (config.modelError || (config.models && config.models.length ? '已读取 ' + config.models.length + ' 个可用模型。' : '填写 API Key 后自动读取模型列表。')); modelState.classList.toggle('pta-error', !!config.modelError); }
        var endpointEl = document.getElementById('pta-endpoint'); if (endpointEl) endpointEl.textContent = baseUrl(state.provider).replace('https://', '');
        var languageMode = document.getElementById('pta-language-mode'); if (languageMode) languageMode.textContent = state.language && state.language !== 'auto' ? '手动 · ' + (LANG_NAMES[state.language] || state.language) : '自动检测';
        document.querySelectorAll('.pta-provider-card').forEach(function (card) { card.classList.toggle('active', card.dataset.provider === state.provider); });
        var images = document.getElementById('pta-images'); if (images) { images.checked = !!config.images; images.disabled = !provider.supportsImages; }
        var skip = document.getElementById('pta-skip'); if (skip) skip.checked = state.skipAnswered;
        var continuous = document.getElementById('pta-continuous'); if (continuous) continuous.checked = state.continuous;
    }

    function bindUI(root) {
        var shell = document.getElementById('pta-shell'), drawer = document.getElementById('pta-drawer');
        var apiKeyTimer = null;
        shell.addEventListener('click', function () { if (shell.classList.contains('collapsed')) shell.classList.remove('collapsed'); });
        document.getElementById('pta-collapse').addEventListener('click', function (e) { e.stopPropagation(); shell.classList.add('collapsed'); drawer.classList.remove('open'); });
        document.getElementById('pta-theme-toggle').addEventListener('click', function (e) { e.stopPropagation(); state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveState(); applyTheme(); });
        document.getElementById('pta-settings').addEventListener('click', function (e) { e.stopPropagation(); drawer.classList.add('open'); });
        document.getElementById('pta-drawer-close').addEventListener('click', function () { drawer.classList.remove('open'); });
        function bindDropdownTrigger(triggerId, wrapperId) {
            document.getElementById(triggerId).addEventListener('click', function (e) {
                e.stopPropagation();
                var wrapper = document.getElementById(wrapperId);
                if (!wrapper || this.disabled) return;
                var wasOpen = wrapper.classList.contains('open');
                closeModelDropdown();
                if (wasOpen) return;
                clearTimeout(wrapper._ptaCloseTimer);
                wrapper.classList.remove('closing');
                wrapper.classList.add('open');
                this.setAttribute('aria-expanded', 'true');
            });
        }
        bindDropdownTrigger('pta-model-trigger', 'pta-model-select');
        bindDropdownTrigger('pta-language-trigger', 'pta-language-select');
        document.addEventListener('click', function (e) {
            var wrappers = document.querySelectorAll('.pta-model-select');
            var inside = Array.prototype.some.call(wrappers, function (wrapper) { return wrapper.contains(e.target); });
            if (!inside) closeModelDropdown();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModelDropdown(); });
        document.querySelectorAll('.pta-provider-card').forEach(function (card) { card.addEventListener('click', function () { saveSettings(); state.provider = card.dataset.provider; syncUI(); if (state.configs[state.provider].apiKey && !state.configs[state.provider].models.length) loadModels(state.provider, true); }); });
        document.getElementById('pta-api-key').addEventListener('input', function () {
            var value = this.value, config = state.configs[state.provider];
            if (value.trim() !== config.apiKey) { config.models = []; config.model = ''; config.modelError = ''; syncUI(); this.value = value; }
            clearTimeout(apiKeyTimer);
            var providerAtInput = state.provider;
            apiKeyTimer = setTimeout(function () {
                if (providerAtInput === state.provider && value.trim().length >= 10) { saveSettings(); loadModels(providerAtInput, false); }
            }, 800);
        });
        document.getElementById('pta-api-key').addEventListener('blur', function () { saveSettings(); if (state.configs[state.provider].apiKey) loadModels(state.provider, false); });
        document.getElementById('pta-language').addEventListener('change', function () { state.language = this.value || 'auto'; saveState(); syncUI(); log('编程语言已设为 ' + languageLabel(state.language), 'info'); });
        document.getElementById('pta-model').addEventListener('change', function () { state.configs[state.provider].model = this.value; state.configs[state.provider].modelError = ''; saveState(); syncUI(); });
        document.getElementById('pta-images').addEventListener('change', function () { state.configs[state.provider].images = this.checked; saveState(); });
        document.getElementById('pta-refresh-models').addEventListener('click', function () { saveSettings(); loadModels(state.provider, false); });
        document.getElementById('pta-drawer-save').addEventListener('click', function () { saveSettings(); drawer.classList.remove('open'); toast('设置已保存，正在读取模型'); loadModels(state.provider, false); });
        document.getElementById('pta-log-clear').addEventListener('click', function (e) { e.stopPropagation(); document.getElementById('pta-log').innerHTML = '<div class="pta-empty">记录已清空</div>'; document.getElementById('pta-log-count').textContent = '0'; });
        document.getElementById('pta-test').addEventListener('click', async function (e) { e.stopPropagation(); saveSettings(); if (!state.configs[state.provider].apiKey) { setStatus('未配置 Key', '请先填写 API Key', ''); log('测试失败：请先配置 API Key', 'warning'); return; } toast('正在测试连接…'); try { await requestAI([{ role: 'user', content: '只回复 OK，不要输出思考过程' }], 256); toast(PROVIDERS[state.provider].name + ' 连接成功'); setStatus('连接正常', '测试通过', 'ok'); log(PROVIDERS[state.provider].name + ' 连接测试通过', 'success'); } catch (error) { toast('错误已记录到面板'); setStatus(/API Key 无效/.test(error.message) ? 'Key 错误' : '连接失败', error.message, ''); log('连接失败：' + error.message, 'warning'); } });
        document.getElementById('pta-start').addEventListener('click', function (e) { e.stopPropagation(); if (state.running) stopSolve(); else startSolve(); });
    }

    function saveSettings() {
        var config = state.configs[state.provider];
        var nextKey = (document.getElementById('pta-api-key').value || '').trim();
        if (nextKey !== config.apiKey) { config.models = []; config.model = ''; config.modelError = ''; }
        config.apiKey = nextKey;
        config.model = (document.getElementById('pta-model').value || '').trim();
        config.images = !!document.getElementById('pta-images').checked;
        state.language = document.getElementById('pta-language').value || 'auto';
        state.skipAnswered = document.getElementById('pta-skip').checked;
        state.continuous = document.getElementById('pta-continuous').checked;
        saveState(); syncUI();
    }

    function loadModels(provider, silent) {
        var config = state.configs[provider];
        if (!config || !config.apiKey) { if (!silent) toast('请先填写 API Key'); return; }
        config.modelsLoading = true; config.modelError = ''; syncUI();
        requestModels(provider).then(function (models) {
            config.models = models;
            if (!config.model || models.indexOf(config.model) < 0) config.model = models[0];
            config.modelsLoading = false; config.modelError = ''; saveState();
            if (provider === state.provider) syncUI();
            toast(PROVIDERS[provider].name + ' 已读取 ' + models.length + ' 个模型');
        }).catch(function (error) {
            config.modelsLoading = false; config.modelError = error.message;
            if (provider === state.provider) { syncUI(); setStatus(/API Key 无效/.test(error.message) ? 'Key 错误' : '模型读取失败', error.message, ''); log('模型读取失败：' + error.message, 'warning'); }
            if (!silent) toast('错误已记录到面板');
        });
    }

    function setStatus(label, sub, mode) {
        var dot = document.getElementById('pta-status-dot'), title = document.getElementById('pta-status-label'), text = document.getElementById('pta-status-sub');
        if (dot) dot.className = 'pta-status-dot ' + (mode || '');
        if (title) title.textContent = label;
        if (text) text.textContent = sub;
    }

    function startSolve() {
        saveSettings();
        if (!state.configs[state.provider].apiKey) { toast('请先在设置中配置 API Key'); document.getElementById('pta-drawer').classList.add('open'); return; }
        if (!state.configs[state.provider].model || !state.configs[state.provider].models.length) { toast('请先获取并选择模型'); document.getElementById('pta-drawer').classList.add('open'); loadModels(state.provider, false); return; }
        state.running = true; document.getElementById('pta-start').textContent = '停止解题'; document.getElementById('pta-start').classList.add('stop'); setStatus('正在处理', PROVIDERS[state.provider].name + ' 工作中…', 'live'); log('任务开始', 'info');
        autoSolve().catch(function (error) { log(error.message || String(error), 'warning'); toast('任务中断'); }).finally(function () { stopSolve(true); });
    }

    function stopSolve(completed) { state.running = false; var button = document.getElementById('pta-start'); if (button) { button.textContent = '开始解题'; button.classList.remove('stop'); } setQuestionProgress(completed ? '已完成' : '已停止', 1, 1); setStatus(completed ? '已完成' : '已停止', completed ? '评分与答题流程已结束' : '任务已暂停', completed ? 'ok' : ''); }

    function boot() {
        loadState(); render(); log('面板已就绪，进入具体题目后开始。', 'info');
        if (state.configs[state.provider].apiKey && !state.configs[state.provider].models.length) setTimeout(function () { loadModels(state.provider, true); }, 250);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
