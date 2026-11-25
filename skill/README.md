# prompt-hone (skill)

The same rules the plugin applies to the composer, packaged as a plain `SKILL.md` for hosts that
have no composer to write into: the agent rewrites a prompt **in the conversation** instead of
editing your input box.

`SKILL.md` is the open Agent Skills format, so one file serves many hosts — no build step, no
dependencies, no code.

## Install

Copy this directory into the host's skills folder, keeping the folder name:

| Host | Destination |
|---|---|
| **DeepSeek Harness** | `~/.dsh/skills/prompt-hone/` |
| **Claude Code** | `~/.claude/skills/prompt-hone/` |
| **Codex CLI** | `~/.codex/skills/prompt-hone/` (or `.agents/skills/prompt-hone/` in a project) |
| **Cursor / Gemini CLI / others** | the host's documented skills directory, or a project-level `.agents/skills/` |

```sh
# example: DeepSeek Harness
mkdir -p ~/.dsh/skills
cp -R prompt-hone ~/.dsh/skills/
```

Verify by asking the host to "润色这段提示词" or "polish this prompt" — it should load this skill.

## What it does

- Rewrites a rough draft into a structured prompt (goal / input / constraints / output / acceptance)
  while keeping your intent, language, variable names and facts untouched.
- Returns **only the prompt** — no preamble, no explanation, unless you ask for one.
- Three strengths: light (wording only), medium (default), strong (full structure).
- Refuses filler ("请认真思考", "作为一个资深专家") and never invents facts; gaps become `[待补充: …]`.

## Plugin vs skill

| | plugin (`../plugin/`) | skill (this folder) |
|---|---|---|
| Writes into | the composer, in place, with undo | the conversation |
| Needs | DSH | any host that reads `SKILL.md` |
| Best for | "make this draft I'm about to send better" | "help me write/repair a prompt" |

The plugin is at <https://github.com/Miles22ui/dsh-prompt-hone>.


---

## 中文说明

这是插件同一套规则的 skill 版本，给**没有输入框可改**的宿主用：agent 在对话里改写提示词，而不是编辑你的输入框。

### 安装

把本目录拷到宿主的 skills 目录，目录名保持不变：

| 宿主 | 目标位置 |
|---|---|
| **DeepSeek Harness** | `~/.dsh/skills/prompt-hone/` |
| **Claude Code** | `~/.claude/skills/prompt-hone/` |
| **Codex CLI** | `~/.codex/skills/prompt-hone/`（或项目内 `.agents/skills/prompt-hone/`） |
| **Cursor / Gemini CLI 等** | 各自文档里的 skills 目录，或项目内 `.agents/skills/` |

```sh
mkdir -p ~/.dsh/skills
cp -R prompt-hone ~/.dsh/skills/
```

验证：对宿主说「润色这段提示词」，应当命中本 skill。

### 它会做什么

- 把草稿改写成结构化提示词（目标 / 输入 / 约束 / 输出 / 验收），保留原意、语言、变量名与事实
- **只输出提示词**——没有开场白、没有解释，除非你要
- 三档强度：轻（只改措辞）、中（默认）、重（完整结构）
- 不写空话、不编造事实；缺信息写成 `[待补充: …]`

插件版见 <https://github.com/Miles22ui/dsh-prompt-hone>。
