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
