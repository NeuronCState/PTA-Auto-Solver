# PTA Auto Solver

一个面向 [拼题 A（PTA）](https://pintia.cn/) 的 Tampermonkey AI 辅助答题脚本。

当前版本：`1.5.0`  
作者：`NeuronCState`

项目主页：[neuroncstate.github.io/PTA-Auto-Solver](https://neuroncstate.github.io/PTA-Auto-Solver/)

## 功能

- 支持 DeepSeek 和 MiMo 两个 AI 供应商。
- 接入 OpenRouter，自动读取多供应商模型，并将 Free 模型排在下拉列表最上方。
- 填写 API Key 后自动读取供应商模型列表，可手动选择模型。
- DeepSeek 默认关闭图片输入，MiMo 默认开启图片输入。
- 首页直接选择编程语言，支持自动检测、C、C++、Python、Java、Pascal。
- 自定义黑白玻璃风格面板和统一下拉框动画。
- “跳过已作答”“连续答题”和图片输入均使用横向胶囊按钮。
- 一个按钮同时切换 PTA 页面和脚本面板的深色/浅色模式。
- 显示真实题目总进度，例如 `1 / 30`、`2 / 30`。
- 编程题和函数题支持：
  1. 提取题干、函数接口、代码框架、裁判代码和样例；
  2. 请求 AI 生成代码；
  3. 写入 PTA 编辑器；
  4. 点击“提交本题作答”；
  5. 等待 PTA 评分并读取分数；
  6. 非满分时最多自动重答 1 次；
  7. 开启“连续答题”且本题满分时进入下一题。
- 可选择跳过已经填写过答案的题目。
- 错误会显示在面板状态和运行记录中，不依赖无法捕获的弹窗。

## 界面预览

### 主页面

![PTA Auto Solver 主页面](./screenshots/main-page.png)

### 深色模式主页面

![PTA Auto Solver 深色模式](./screenshots/dark-mode-main-page.png)

### 模型配置页面

![PTA Auto Solver 模型配置](./screenshots/model-settings.png)

## 支持题型

| PTA 类型 | 脚本支持 |
| --- | --- |
| 判断题 | 支持 |
| 单选题 | 支持 |
| 多选题 | 支持 |
| 填空题 | 支持 |
| 程序填空题 | 支持 |
| 函数题 | 支持 |
| 编程题 | 支持 |
| 多文件编程题 | 当前未接入专用提取流程 |

## 安装

1. 安装 Tampermonkey 浏览器扩展。
2. 打开 [项目主页](https://neuroncstate.github.io/PTA-Auto-Solver/)，点击“安装 / 更新脚本”；也可以直接打开 [PTA Auto Solver 脚本](./PTA%20Auto%20Solver%20Pro-1.4.2.user.js)。
3. 在 Tampermonkey 页面确认安装或更新脚本。
4. 刷新 PTA 页面。

如果浏览器没有自动进入安装页面，也可以打开 Tampermonkey 控制面板，选择“添加新脚本”或“导入”，然后导入 `.user.js` 文件。

脚本元数据已经配置 `@updateURL` 和 `@downloadURL`。后续发布新版本时，Tampermonkey 可以从仓库的原始脚本地址检查更新。

## GitHub Pages

`docs/` 是项目主页的静态源文件，发布后地址为：

<https://neuroncstate.github.io/PTA-Auto-Solver/>

仓库设置中选择 **Settings → Pages → Deploy from a branch → `main` / `/docs`** 即可启用。页面包含安装入口、功能介绍、截图和 GitHub 链接；`robots.txt` 与 `sitemap.xml` 也已准备好，搜索引擎收录需要等待一段时间，不能保证立即出现在搜索结果中。

## 使用方法

### 1. 打开 PTA 题目页面

先在 Chrome 或 Edge 中登录 PTA，然后进入具体题目页面。脚本面板会显示在页面右下角。

### 2. 配置 AI

点击面板右上角的设置按钮：

- 选择 DeepSeek 或 MiMo；
- 填写对应 API Key；
- 等待模型列表自动读取；
- 在可用模型下拉框中选择模型；
- 点击“测试”确认连接正常。

API Key 只保存在当前浏览器本地配置中。脚本不会把 Key 上传到自建服务器，但 Key 会按照供应商 API 的要求发送给所选供应商。

### 3. 设置编程语言

编程语言选择位于脚本首页：

- “自动检测”会根据题目标题、接口和代码内容判断语言；
- 也可以手动选择 C、C++、Python、Java 或 Pascal；
- 再次点击已经打开的下拉框可以收起菜单。

### 4. 开始答题

- “跳过已作答”：跳过已有答案的题目；
- “连续答题”：当前题满分后自动进入下一题；
- 点击“开始解题”启动流程；
- 点击“停止解题”停止后续处理。

编程题预算为 `32768` tokens，普通题预算为 `2048` tokens，连接测试使用 `256` tokens。

## 主题切换

面板顶部的月亮/太阳按钮可以同时切换：

- PTA 页面主题；
- PTA Auto Solver 面板主题；
- 设置抽屉、输入框、模型下拉框和语言下拉框主题。

主题选择会保存在当前浏览器，下次打开 PTA 时自动恢复。

## API 配置

脚本当前只保留以下供应商：

| 供应商 | 默认图片输入 | 鉴权方式 |
| --- | --- | --- |
| DeepSeek | 关闭 | Bearer Token |
| MiMo | 开启 | `api-key` 请求头 |
| OpenRouter | 关闭 | Bearer Token |

模型不会固定写死，脚本会请求供应商的 `/models` 接口并显示返回的可用模型。OpenRouter 返回的 Free 模型会优先显示，并在名称后标注 `· Free`。

## 常见问题

### 模型列表为空

检查 API Key 是否完整、供应商是否选对，然后点击“刷新模型”。如果 Key 无效，错误会显示在设置页面和运行记录中。

### AI 返回为空或只有推理内容

部分思考型模型可能消耗大量输出预算，只返回 `reasoning_content` 而没有最终答案。当前代码题预算已经提高到 `32768` tokens；仍然失败时，可以更换模型或重新测试连接。

### 进度一直显示“等待开始”

确认已进入具体题目页面，而不是题目集概览页。脚本会读取 PTA 题目导航中的题目总数和当前题号。

### 脚本没有显示

检查：

- Tampermonkey 是否启用；
- 当前网址是否为 `https://pintia.cn/`；
- 是否刷新了页面；
- 是否安装了最新版脚本。

### 深色模式页面颜色异常

深色模式会对 PTA 页面进行统一暗色处理，并保留常规图片/视频的原始观感。个别 PTA 弹层或第三方组件可能使用独立样式，刷新页面后通常可以恢复。

## 权限说明

脚本使用的主要权限：

- `GM_xmlhttpRequest`：请求 AI 供应商模型列表和聊天接口；
- `GM_setClipboard`：当编辑器无法直接写入时，将答案复制到剪贴板；
- `@connect api.deepseek.com`：访问 DeepSeek API；
- `@connect api.xiaomimimo.com`：访问 MiMo API；
- `@connect openrouter.ai`：访问 OpenRouter 模型列表和聊天接口。

脚本只匹配 `https://pintia.cn/*` 页面。

## 验证记录

- JavaScript 语法检查通过。
- 已在真实 PTA 函数题页面验证：代码写入、提交、等待评分、读取 `20 / 20`、满分后进入下一题。
- 当前版本包含最新主题切换和深色控件样式，重新导入脚本后生效。

## 使用提醒

自动提交会对 PTA 产生真实提交记录。建议首次使用时关闭“连续答题”，先检查 AI 生成的代码和评分结果，再开启连续处理。
