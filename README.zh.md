# dsh-prompt-hone

一个 DeepSeek Harness 插件：**原地润色输入框草稿**。写完一句话，点 ✨，它变成结构化、可执行的提示词，
停在输入框里等你改或直接发。另外附带一份可移植的 `SKILL.md`，给没有输入框可改的 agent 用。

[English](README.md)

[![ci](https://github.com/Miles22ui/dsh-prompt-hone/actions/workflows/ci.yml/badge.svg)](https://github.com/Miles22ui/dsh-prompt-hone/actions/workflows/ci.yml) ![dsh](https://img.shields.io/badge/tested%20on-DSH%200.2.2--rc.5-blue)

## 为什么是插件，而不只是 skill

skill 能在**对话里**改写提示词，但改不了你正在打字的那段文字。这个插件直接替换输入框内容并留在原地——
撤销一次点击，你不点发送就不会发给模型。

仓库里的 `skill/` 是同一套规则，给没有输入框的宿主用（Claude Code、Codex CLI、Cursor、Gemini CLI 等）。

## 安装

**要求**：DSH `>=0.2.2-rc.5`（实测于 `0.2.2-rc.5`）。Node 只用于跑测试。

### 从插件市场索引安装（推荐）

1. DSH → **Plugins** → **Discover**
2. 添加索引地址：`https://miles22ui.github.io/dsh-prompt-hone/market/index.json`
   （备用地址：`https://raw.githubusercontent.com/Miles22ui/dsh-prompt-hone/main/market/index.json`）
3. 在列表里安装 **提示词润色器**

市场安装的是**被 pin 住的某个提交**（`git+https://github.com/Miles22ui/dsh-prompt-hone.git#8574e2c…&path:/plugin`），
所以只有索引宣告新版本时才会更新。

### 从本地目录安装（开发用）

1. 克隆本仓库
2. DSH → **Plugins** → **Add plugin** → 选择 `plugin/` 目录
3. 若插件行没有自动激活，重启 DSH

目录是**链接安装**，不是拷贝：改完 `plugin/` 重启 DSH 即生效；装好后不要移动或改名。

## 用法

| | |
|---|---|
| **润色** | 写草稿，点发送键旁的 **✨**。草稿被替换，旁边出现 **撤销** |
| **强度** | 点 ✨ 旁的 **中 / 轻 / 重**（会被记住） |
| **只润一段** | 先选中文字再点 ✨，只改选区，Ctrl+Z / Cmd+Z 可撤回 |
| **取消** | 转圈时再点一次 ✨；另有 60 秒超时 |
| **键盘** | `/polish --strong <草稿>` ⏎：输入框先清空，随后改写稿自动填回 |
| **用量** | 润色后悬停 ✨：`上次：入 820 / 出 460 tokens` |

草稿里含文件 / Session **引用胶囊**时**拒绝替换**（整段替换会冲掉引用），不会偷偷丢掉。

## 设置

**Plugins → 提示词润色器 → 详情页**：

- 可改：默认强度、客户端超时（5–600 秒），存在浏览器里
- 只读：模型路由、Host 超时、输入上限，并附可复制的 `cordis.patch.yml` 片段

润色使用的模型就是**输入框里当前选中的模型**，不需要单独配置。

## 它是怎么跑通的

```
✨  →  ctx.get('remote.commands').execute('/polish --medium <草稿>')
    →  Host：在会话模型上跑一次 ctx.llm.stream()
    →  命令结果带回改写文本
    →  inputActions.setDraft()（整段）或 insertText()（选区）
```

Host 侧注册 `/polish`；浏览器侧从 `RemoteResult` 信封里取结果。第三方命令的结果不会渲染进对话流，
所以由插件自己呈现——顺带也让对话里不留噪音行。

## 仓库结构

```
plugin/     DSH bundle（Host 的 index.js + 浏览器 client.js + prompts.js + 语言包 + 图标）
skill/      prompt-polisher/SKILL.md，给没有输入框的宿主
test/       两套零依赖测试（Host + 客户端），npm test 运行
```

## 测试

```
npm test
```

三套零依赖测试，不需要 DSH 运行时：Host 套件伪造 `ctx.commands` / `ctx.llm`，客户端套件伪造 Web
模块加载器与 React hooks，另有一套仓库级守门测试盯着市场索引——版本没同步或 `commit` 过期会让 CI 变红，
而不是悄悄装错。

## 已知限制

- 客户端依赖 DSH 的内部入口（`ctx.get('remote.commands')`、`command/executed`、`inputActions`）。
  DSH 升级可能打破它；届时插件会报「通道不可用」而不是静默失败，`engines.dsh` 会在安装时拦截不兼容版本。
- 不保留引用胶囊，遇到就拒绝替换。
- 每次润色都是一次真实模型请求，按量计费；草稿会发给你选中的服务商。
- 草稿是作为 `/polish` 的参数字符串传过去的，因此**会写进会话日志**——即使你最后没有发送。这保留了
  「模型可见即可从日志重建」这条不变量；不想让草稿留痕，就别拿机密文本点润色。
- 诊断写入 `/tmp/prompt-polisher-trace.log`（只记字符数与错误码，不记内容），超 1 MiB 轮转。

## 发布流程（维护者）

1. 改 `plugin/package.json` 的 `version`
2. 提交、`git tag vX.Y.Z`、把两者都推上去
3. 在 `market/index.json` 里加这个版本：`publishTimestamp` 用 Unix **秒**，`source.commit` 必须是发布提交的
   40 位 SHA（绝不要写分支名）
4. 推送后等 Pages 构建（约 1 分钟）。CDN 对 Pages 副本缓存 10 分钟、对 raw 副本缓存约 5 分钟，
   所以别人可能短暂看到旧版本

## 许可证

MIT
