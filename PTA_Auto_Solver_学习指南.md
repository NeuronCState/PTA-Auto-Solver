# PTA 自动解题脚本 学习指南

> 本文档用于帮助你理解 `pta_user_script_v52_deepseek_only.js` 的工作原理。
> 你可以基于本文档，用自己的话向他人讲解。

---

## 一、整体架构

### 这个脚本是做什么的？

这是一个 **Tampermonkey 用户脚本**（运行在浏览器中的 JavaScript 程序），用于自动解答 PTA（编程练习平台）上的各类题目。

**核心原理：** 用 JavaScript 自动提取题目内容，通过 **DeepSeek API** 获取答案，再自动填入网页。

**本版本特点：**

- 只使用 **DeepSeek API**（云端 AI）
- 不需要本地部署任何服务
- 配置更简单，只需一个 API Key

**支持的题型：**

| 题型 | 说明 | 输出格式 |
|------|------|----------|
| 判断题 | 选择 ✓ 或 ✗ | `true` 或 `false` |
| 单选题 | 选择一个选项 | 选项字母如 `A`、`B` |
| 多选题 | 选择多个选项 | 选项字母拼接如 `AB`、`ACD` |
| 填空题 | 输入文本答案 | 纯文本答案 |
| 程序填空 | 在代码中填入缺失的部分 | 用 `\|` 分隔如 `ans1\|ans2\|ans3` |
| 函数题 | 补全函数代码 | 纯代码 |
| 编程题 | 编写完整程序 | 纯代码 |

### 核心工作流程

```
用户点击"开始解题"
    ↓
自动识别当前页面题型（URL 判断）
    ↓
根据题型构建不同的"提示词"（Prompt）
    ↓
直接发送给 DeepSeek API
    ↓
接收 AI 返回的答案
    ↓
自动将答案写入页面输入框
    ↓
（可选）自动点击"下一题"继续
```

---

## 二、代码结构总览

脚本约 **1100 行**，可分为以下几大部分：

```
1. 配置区域
   - 脚本元信息
   - 全局变量（DeepSeek API 设置）

2. Prompt 模板配置（约 行 14-30）
   - 不同题型对应的"系统提示词"

3. 工具函数（约 行 32-130）
   - DeepSeek API 调用
   - 底层辅助功能（Shadow DOM 操作等）

4. 题型检测（约 行 132-160）
   - 根据 URL 判断题型
   - 从题集名称判断编程语言

5. 题目提取（约 行 162-310）
   - 从网页中提取题目描述、代码、样例

6. API 封装（约 行 420-480）
   - 统一的 AI 调用接口（submitQuestion）

7. 答案写入（约 行 490-530）
   - 将 AI 返回的答案填入网页

8. 各题型答题函数（约 行 535-900）
   - 填空题、判断题、选择题、函数题、编程题

9. UI 面板（约 行 950-1100）
   - 右侧浮窗界面（设置、按钮、日志）
```

---

## 三、关键概念解释

### 3.1 什么是 Tampermonkey？

Tampermonkey 是一个浏览器插件，可以运行用户编写的 JavaScript 脚本。这些脚本会在访问特定网站时自动执行，可以"篡改"网页的行为。

```javascript
// 这行注释告诉 Tampermonkey：只在 pintia.cn 上运行
// @match        https://pintia.cn/*

// 这行允许脚本向 api.deepseek.com 发起请求
// @connect      api.deepseek.com
```

### 3.2 什么是 GM_xmlhttpRequest？

普通的 `fetch()` 受到浏览器安全策略限制，无法向不同域的服务器发起请求。`GM_xmlhttpRequest` 是 Tampermonkey 提供的特殊 API，可以绕过这个限制，向任何服务器发送请求。

```javascript
// 直接向 DeepSeek API 发送请求
GM_xmlhttpRequest({
    method: 'POST',
    url: 'https://api.deepseek.com/chat/completions',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey    // 认证信息
    },
    data: JSON.stringify({
        model: 'deepseek-chat',                // 使用的模型
        messages: [
            { role: 'system', content: '你是一个...' },
            { role: 'user', content: '题目内容...' }
        ],
        temperature: 0.0                     // 温度设为0，输出更确定
    }),
    onload: function(resp) {
        // 请求成功，resp.responseText 是返回的 JSON
        var data = JSON.parse(resp.responseText);
        var answer = data.choices[0].message.content;
    }
});
```

### 3.3 Shadow DOM 穿透

PTA 网站的某些元素（如代码编辑器）使用了 **Shadow DOM** 技术。Shadow DOM 是一种"封装"的 DOM，子节点的内容对外部 JavaScript 隐藏。

**普通查询无效：**

```javascript
document.querySelectorAll('.cm-editor')
// 可能找不到 shadow 内的元素，返回空
```

**需要穿透查询：**

```javascript
function queryDeepAll(selector) {
    var results = [];
    // 1. 先查主文档
    results.push.apply(results, document.querySelectorAll(selector));

    // 2. 再查每个 Shadow DOM
    var allEls = document.querySelectorAll('*');
    for (var i = 0; i < allEls.length; i++) {
        if (allEls[i].shadowRoot) {
            results.push.apply(results,
                allEls[i].shadowRoot.querySelectorAll(selector)
            );
        }
    }
    return results;
}
```

### 3.4 Prompt（提示词）是什么？

Prompt 是发送给 AI 的"指令"。AI 根据 Prompt 的内容来决定输出什么。

**System Prompt（系统提示词）** — 设定 AI 的角色和规则：

```
你是一个严谨的判断题答题专家。严格遵守输出格式，不得有任何额外文字。
输出格式：只输出 true 或 false，其他任何字符都不允许输出。
```

**User Prompt（用户提示词）** — 提供题目内容：

```
【编程语言】C
【题目】
计算并输出两个整数的和。

请判断以上说法是否正确，只输出 true 或 false。
```

### 3.5 为什么需要严格的输出格式？

因为脚本需要**自动解析** AI 的返回结果并填入网页。如果 AI 输出多余文字（如"答案是 true"），脚本就无法正确解析。

**严格格式的例子：**

| 题型 | 格式要求 | 示例 |
|------|----------|------|
| 判断题 | 只输出 `true` 或 `false` | `true` |
| 单选题 | 只输出选项字母 | `B` |
| 多选题 | 只输出字母拼接 | `ABD` |
| 程序填空 | 用 `\|` 分隔 | `scanf\|printf\|return 0` |

---

## 四、核心函数解析

### 4.1 callDeepSeek — DeepSeek API 调用

这是最底层的 API 请求函数：

```javascript
function callDeepSeek(body) {
    return new Promise(function(resolve) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.deepseek.com/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            data: JSON.stringify(body),
            timeout: 120000,  // 2分钟超时
            onload: function(resp) {
                // 成功：解析返回，提取答案内容
                var data = JSON.parse(resp.responseText);
                var raw = data.choices[0].message.content;
                // 去掉 markdown 代码块标记
                raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
                resolve({ ok: true, data: { ready: true, answer: raw }, error: null });
            },
            onerror: function(err) {
                // 失败
                resolve({ ok: false, data: null, error: '网络错误' });
            }
        });
    });
}
```

**关键参数说明：**

| 参数 | 值 | 作用 |
|------|-----|------|
| `model` | `deepseek-chat` | DeepSeek 的对话模型 |
| `temperature` | `0.0` | 设为0让输出更确定、更稳定 |
| `max_tokens` | `2048` | 最大输出长度 |
| `timeout` | `120000` | 2分钟超时 |

### 4.2 submitQuestion — 统一的题目提交接口

所有题型都通过这个函数来调用 AI，它负责**构建完整的 Prompt**：

```javascript
async function submitQuestion(payload) {
    // payload 示例：{ questionType: 'fill', description: '...', language: 'c' }

    // 1. 获取系统提示词
    var sysContent = SYS_PROMPTS[qType];

    // 2. 根据题型构建用户提示词
    var userContent = '';
    if (qType === 'judge') {
        userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请判断以上说法是否正确，只输出 true 或 false。';
    } else if (qType === 'fill') {
        userContent = '【编程语言】' + langName + '\n【题目】\n' + desc + '\n\n请直接输出填空答案，不要任何解释。';
    } else if (qType === 'program-fill') {
        userContent = '【编程语言】' + langName + '\n【题目描述】\n' + desc + '\n\n【待填写的代码】\n' + code + '\n\n共 ' + blankCount + ' 个空需要填写。\n输出格式：用 | 分隔，如：ans1|ans2|ans3';
    }
    // ... 其他题型类似

    // 3. 发送给 DeepSeek
    return await callDeepSeek({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: sysContent },
            { role: 'user', content: userContent }
        ],
        temperature: 0.0,
        max_tokens: 2048
    });
}
```

### 4.3 writeCodeToEditor — 向 CodeMirror 编辑器写入代码

PTA 使用 CodeMirror 作为代码编辑器。直接 `input.value = xxx` 无效，需要操作 CodeMirror 内部 API。

```javascript
async function writeCodeToEditor(cmEditor, code) {
    var cmContent = cmEditor.querySelector('.cm-content');

    // 方式 1：通过 cmTile.view.dispatch（推荐）
    var tile = cmContent.cmTile;
    if (tile && tile.view && tile.view.dispatch) {
        tile.view.dispatch({
            changes: { from: 0, to: tile.view.state.doc.length, insert: code }
        });
        return true;
    }

    // 方式 2：遍历 DOM 找 _view
    // 方式 3：CodeMirror 5 兼容
}
```

---

## 五、各题型处理逻辑

### 5.1 填空题

```
1. 收集页面上所有 <input> 元素
2. 排除 radio、checkbox、button 等非填空框
3. 找到每个 input 对应的题目描述
4. 调用 DeepSeek API 获取答案
5. 使用特殊方法修改 input 值（绕过只读限制）
6. 触发 input/change 事件让 PTA 保存答案
```

### 5.2 判断题/选择题

```
1. 收集所有 <input type="radio">
2. 按 name 属性分组（每组 = 一道题）
3. 找到每道题的题干描述（含代码部分）
4. 调用 DeepSeek，返回 "true"/"false" 或选项字母
5. 找到对应选项的 label，触发 click 事件
```

### 5.3 程序填空

```
1. 按 cm-editor 分组（每个代码块 = 一道题）
2. 收集每个代码块中的所有空
3. 将代码中的 _____ 替换为【空N】标记
4. 调用 DeepSeek，返回格式：答案1|答案2|答案3
5. 按 | 拆分，分别填入对应位置
```

### 5.4 函数题 / 编程题

```
1. 找到页面中可写的 CodeMirror 编辑器
2. 提取题目描述（含代码框架）
3. 调用 DeepSeek，返回完整函数/程序代码
4. 向编辑器写入代码
5. 自动点击"提交本题作答"按钮
6. 等待评测结果弹窗
7. 关闭弹窗，点击"下一题"继续
```

---

## 六、UI 面板结构

脚本在页面右下角创建了一个浮窗面板：

```
┌─────────────────────────────┐
│ PTA Auto v52  DeepSeek ⚙  │
├─────────────────────────────┤
│ 待机                        │  ← 显示当前题型
│ 语言 [C++] ▼               │  ← 选择语言
│ ☐ 跳过已答  ☐ 连续答题     │  ← 选项
│                             │
│   ▶ 开始解题                │  ← 主按钮
├─────────────────────────────┤
│ [⚙] 点击展开 API 设置      │
│   模型: deepseek-chat      │
│   Base URL: api.deepseek.com│
│   API Key: ************     │
│   [保存] [测试]             │
└─────────────────────────────┘
```

**选项说明：**

| 选项 | 作用 |
|------|------|
| 跳过已答 | 已填过答案的题目不再重新作答 |
| 连续答题 | 答完一页后自动进入下一页 |

**API 设置说明：**

| 字段 | 说明 | 默认值 |
|------|------|--------|
| 模型 | DeepSeek 模型名 | `deepseek-chat` |
| Base URL | API 地址 | `https://api.deepseek.com` |
| API Key | 你的密钥 | （需填写） |

---

## 七、与其他版本的区别

本版本（DeepSeek Only）与原版的区别：

| 功能 | 原版 | 本版 |
|------|------|------|
| AI 提供商 | Ollama（本地）+ DeepSeek | 仅 DeepSeek |
| 本地服务 | 需要安装 Ollama | 不需要 |
| 配置复杂度 | 高（多个选项） | 低（只需 API Key） |
| API 连接测试 | 仅 DeepSeek | ✅ 有 |
| 模型选择 | 多个下拉框 | 固定 `deepseek-chat` |
| 代码量 | ~1700 行 | ~1100 行 |

**为什么只保留 DeepSeek？**

1. **配置简单**：用户只需一个 API Key，无需安装任何本地服务
2. **DeepSeek 足够强**：`deepseek-chat` 模型可以胜任所有题型
3. **稳定性好**：云端 API 比本地 Ollama 更稳定

---

## 八、文件结构图

```
pta_user_script_v52_deepseek_only.js
│
├── 元信息 & 全局变量
│   ├── @name, @version（Tampermonkey 必需）
│   ├── @connect api.deepseek.com（允许访问）
│   └── _ptaDsSettings（从 localStorage 读取）
│
├── Prompt 模板（SYS_PROMPTS）
│   ├── judge        → 严格格式：只输出 true/false
│   ├── choice       → 严格格式：只输出字母
│   ├── multi_choice → 严格格式：只输出字母拼接
│   ├── fill         → 严格格式：只输出答案
│   ├── program-fill → 严格格式：用 | 分隔
│   ├── function     → 动态构建
│   └── programming  → 动态构建
│
├── DeepSeek API 调用
│   └── callDeepSeek()  ← 唯一的后端请求
│
├── 工具函数
│   ├── queryDeepAll()   ← 穿透 Shadow DOM
│   ├── getDeepText()    ← 穿透 Shadow DOM 取文本
│   └── getDeepInnerText() ← 获取完整文本
│
├── 题型检测
│   ├── detectQuestionType()  ← URL 匹配
│   └── detectLanguage()       ← 从代码特征判断语言
│
├── 题目提取
│   ├── extractProgrammingQuestion()  ← 编程题描述
│   ├── getCmEditorCode()             ← 从 CodeMirror 读代码
│   ├── getDescriptionForInputNew()   ← 普通填空描述
│   ├── getProgramFillDescription()   ← 程序填空描述
│   └── getQuestionText()            ← 判断/选择描述
│
├── API 层
│   └── submitQuestion()  ← 构建 Prompt + 调用 DeepSeek
│
├── 答案写入
│   ├── writeFillAnswer()   ← 填空题写入
│   └── writeChoiceAnswer() ← 判断/选择题写入
│
├── 答题函数
│   ├── solveFillBatch()              ← 填空题
│   ├── solveJudgeBatch()              ← 判断题
│   ├── solveChoiceBatch()            ← 选择题
│   ├── solveProgramFillBatch()       ← 程序填空（批量）
│   ├── solveProgramFillBatchByInputs()← 程序填空（单个）
│   ├── solveFunctionBatch()           ← 函数题
│   ├── solveProgrammingBatch()       ← 编程题
│   └── submitAndWriteCode()          ← 统一提交逻辑
│
└── UI 面板（initPanel）
    ├── DeepSeek 设置（保存/测试）
    ├── 语言选择器
    ├── 选项复选框
    ├── 开始/停止按钮
    └── 日志显示
```

---

## 九、汇报建议

### 建议的讲解顺序

1. **开场（2 分钟）**
   - 介绍这是什么工具
   - 用来解决什么问题
   - 演示截图或简单视频

2. **原理概述（3 分钟）**
   - AI + 浏览器自动化
   - 用流程图解释核心工作流
   - 强调"不需要本地服务"的简洁性

3. **核心难点（5 分钟）**
   - Shadow DOM 穿透（为什么普通查询不行）
   - CodeMirror 写入（为什么不能直接赋值）
   - Prompt 工程（如何约束 AI 输出严格格式）

4. **代码结构（3 分钟）**
   - 按模块划分讲解
   - 重点讲 `submitQuestion` 的 Prompt 构建

5. **与其他版本的区别（2 分钟）**
   - 原版需要安装 Ollama
   - 本版只需 API Key，更简单

6. **演示（3 分钟）**
   - 打开 PTA 页面
   - 配置 API Key
   - 现场演示

### 可能被问到的问题

| 问题 | 回答要点 |
|------|----------|
| 为什么需要 API Key？ | DeepSeek API 需要认证，Key 就是你的身份凭证 |
| API Key 安全吗？ | 存在浏览器 localStorage 中，只发送给 DeepSeek 官方 |
| 为什么不直接用 Ollama？ | Ollama 需要本地安装配置，对用户来说更麻烦 |
| 为什么 AI 能答对？ | 靠 Prompt 中的"输出格式要求"来约束 AI 输出正确格式 |
| 程序填空怎么知道有几个空？ | 代码中有 `_____` 标记，split 后计算数量 |
| 浏览器安全吗？ | Tampermonkey 脚本只能操作它匹配的网站，无法访问其他网站 |

---

## 十、参考资料

- **Tampermonkey 文档**：https://www.tampermonkey.net/documentation.php
- **GM_xmlhttpRequest**：https://www.tampermonkey.net/documentation.php#GM_xmlhttpRequest
- **DeepSeek API 文档**：https://api.deepseek.com/
- **CodeMirror**：PTA 使用的代码编辑器库

---

## 十一、快速上手

1. **获取 API Key**
   - 访问 https://platform.deepseek.com/
   - 注册账号并获取 API Key

2. **安装脚本**
   - 安装 Tampermonkey 浏览器插件
   - 创建新脚本，粘贴 `pta_user_script_v52_deepseek_only.js` 内容

3. **配置**
   - 访问 PTA 网站
   - 点击右下角 ⚙ 按钮
   - 填入 API Key，点击"保存"
   - 点击"测试"确认连接成功

4. **使用**
   - 进入题目页面
   - 选择编程语言
   - 点击"开始解题"

---

*本文档旨在帮助你理解和讲解此脚本，请根据实际需求调整内容。*
