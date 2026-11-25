# dsh-prompt-hone

A DeepSeek Harness plugin that polishes the **composer draft** in place: click ✨, and the rough
sentence you were about to send becomes a structured, executable prompt. Plus a portable
`SKILL.md` for agents that polish prompts in conversation instead.

[中文说明](README.zh.md)

[![ci](https://github.com/Miles22ui/dsh-prompt-hone/actions/workflows/ci.yml/badge.svg)](https://github.com/Miles22ui/dsh-prompt-hone/actions/workflows/ci.yml) ![dsh](https://img.shields.io/badge/tested%20on-DSH%200.2.2--rc.5-blue)

## Why a plugin, not just a skill

A skill can rewrite a prompt **in the chat**, but it cannot touch what you are typing. This plugin
rewrites the text inside the composer and leaves it there for you to edit or send — undo is one click,
and nothing is sent to the model unless you send it.

The `skill/` in this repository is the same rules, packaged for agents that have no composer access
(Claude Code, Codex CLI, Cursor, Gemini CLI, …).

## Install

**Requirements**: DSH `>=0.2.2-rc.5` (tested on `0.2.2-rc.5`). Node is only needed to run the tests.

### From the plugin market index (recommended)

1. DSH → **Plugins** → **Discover**
2. Add this index URL: `https://miles22ui.github.io/dsh-prompt-hone/market/index.json`
   (fallback host: `https://raw.githubusercontent.com/Miles22ui/dsh-prompt-hone/main/market/index.json`)
3. Install **Prompt polisher** from the list.

The market pins the release commit (`git+https://github.com/Miles22ui/dsh-prompt-hone.git#8574e2c…&path:/plugin`),
so updates arrive only when the index announces them.

### From a local directory (development)

1. Clone this repository.
2. DSH → **Plugins** → **Add plugin** → choose the `plugin/` directory.
3. Restart DSH if the plugin row does not turn active on its own.

The directory is **linked**, not copied: editing `plugin/` and restarting DSH is enough to pick up
changes; do not move or rename the directory afterwards.

## Usage

| | |
|---|---|
| **Polish** | Write a draft, click **✨** next to Send. The draft is replaced; a **撤销** button restores it. |
| **Strength** | Click the **中 / 轻 / 重** chip next to ✨ (remembered across reloads). |
| **One passage** | Select text first: only the selection is rewritten, undoable with Ctrl+Z / Cmd+Z. |
| **Stop** | Click ✨ again while it is spinning; a 60 s deadline also applies. |
| **Keyboard** | `/polish --strong <draft>` ⏎ — the composer clears, then the rewrite is filled back in. |
| **Usage** | Hover ✨ after a run: `上次：入 820 / 出 460 tokens`. |

Drafts containing file or Session **reference chips** are refused rather than stripped, because a
whole-draft replacement drops those chips.

## Settings

**Plugins → Prompt polisher → details** carries a configuration card:

- editable: default strength, client timeout (5–600 s), saved in the browser;
- read-only: model route, Host timeout, input limit, plus a copyable `cordis.patch.yml` snippet.

The model used is the one **selected in the composer**; no separate model configuration is required.

## How it works

```
✨  →  ctx.get('remote.commands').execute('/polish --medium <draft>')
    →  Host: one auxiliary ctx.llm.stream() call on the Session's model
    →  command result carries the rewrite
    →  inputActions.setDraft() (whole draft) or insertText() (selection)
```

The Host half registers `/polish`; the browser half reads the result out of the `RemoteResult`
envelope. Third-party command results are not rendered into the transcript, so the plugin presents
the text itself — which also keeps the conversation free of noise rows.

## Repository layout

```
plugin/     the DSH bundle (Host index.js + Web client.js + prompts.js + locales + icon)
skill/      prompt-hone/SKILL.md, for composer-less agents
test/       two dependency-free suites (host + client), run with npm test
```

## Tests

```
npm test
```

Three dependency-free suites, no DSH runtime needed: the Host suite fakes `ctx.commands` / `ctx.llm`, the
client suite fakes the Web module loader and React hooks, and a repository suite guards the market index
against version drift (a stale `commit` or an unbumped `version` fails CI instead of installing quietly).

## Known limits

- The client half relies on DSH-internal entry points (`ctx.get('remote.commands')`,
  `command/executed`, `inputActions`). A DSH upgrade can break it; the plugin reports
  「通道不可用」 rather than failing silently. `engines.dsh` gates installs.
- Reference chips are not preserved; the plugin refuses instead.
- Each run is one real model request and is billed as such; the draft is sent to the selected provider.
- The draft travels as a `/polish` command argument, so it is recorded in the Session log even when you
  never send it. That keeps the auxiliary request reconstructable from the log (a DSH invariant); if you
  would rather not have drafts persisted, do not polish confidential text.
- Diagnostics are appended to `/tmp/prompt-hone-trace.log` (sizes and error codes only, never text),
  rotated at 1 MiB.

## Releasing (maintainers)

1. Bump `plugin/package.json` `version`.
2. Commit, `git tag vX.Y.Z`, push both.
3. In `market/index.json`, add the version with `publishTimestamp` in Unix **seconds** and
   `source.commit` set to the release commit's 40-hex SHA (never a branch name).
4. Push, then wait for the Pages build (about a minute). The CDN caches the Pages copy for 10 minutes
   and the raw copy for about 5, so a reader may see the previous version briefly.

## License

MIT
