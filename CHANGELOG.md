# Changelog

## 0.9.0

The interface speaks English too.

- **Interface language** (Auto / 中文 / English) on the plugin's page; Auto follows the browser. The choice
  applies immediately to the composer control and the card, and is remembered per browser.
- Every visible string is localized: tooltips, strength labels (轻/中/重 ↔ Light/Medium/Strong), undo,
  inline errors and the settings card.
- One throwaway scope bug is worth naming: the typed-command handler read a language variable declared in a
  sibling branch, which its own try/catch swallowed. The suite caught it by asserting the visible text, not
  just that nothing crashed.
- Docs are bilingual end to end: READMEs with a switcher, the plugin page carries an English section, and the
  skill README gained a Chinese one.


## 0.8.0

Renamed to avoid a collision in the plugin registry: an unrelated composer polisher already
publishes as `dsh-prompt-polisher`, and its npm name is taken as well.

- Package `dsh-prompt-polisher` → **`dsh-prompt-hone`**; the repository and its Pages site follow.
- Display name: **Prompt hone / 提示词打磨器** (the capability — polishing a composer draft — is unchanged).
- The four identity strings move together as always: `package.json`, `cordis.patch.yml`, the Web module id,
  and the Plugins-page card key.
- Install address changes: the market index URL now lives under the new Pages path.

Nothing changed in how the plugin behaves; upgrading is a reinstall rather than an in-place update,
because the package name is part of its identity.

## 0.7.0

First repository layout, renamed for publication.

- Package renamed `@local/prompt-polisher` → `dsh-prompt-polisher`. Three places move together: `cordis.patch.yml`, the Web module id, and the Plugins-page card key.
- Repository split into `plugin/` (the DSH bundle), `skill/` (portable `SKILL.md`), `test/`, and CI.
- Both test suites now resolve the plugin from the repository layout, so `npm test` runs anywhere.
- Added `LICENSE` (MIT), `engines.dsh`, and the bilingual READMEs.

## 0.6.1

- The configuration card no longer copies this machine's model route into the YAML snippet; it uses placeholders.
- A strength chosen in the card updates the composer chip immediately (same-document `CustomEvent`, because `storage` never fires for the writing tab).
- Switching Session aborts an in-flight rewrite instead of letting it run to the timeout.
- Thrown values are truncated to 200 characters: an error raised inside a `data:`-URL module carries its whole source in the stack and used to flood the console and the tooltip.

## 0.6.0

- **Settings card** on the plugin's Plugins page: default strength and client timeout are editable and saved; Host-only knobs are shown read-only with a copyable `cordis.patch.yml` snippet.
- **Token usage**: the Host remembers each call's usage per Session and answers `/polish --stats` without calling a model; hovering ✨ shows the last call's input/output tokens.

## 0.5.0

- **Timeout and cancel**: 60 s client deadline, 120 s Host backstop (`config.timeoutMs`), and a second click on ✨ cancels the in-flight request.
- **Typed failures are visible**: a failed `/polish` now reports on the control; a result that cannot be filled because the draft changed says so.
- **Selection polish**: select text and click ✨ to rewrite only that span, through the editor's own undoable edit.
- Trace file rotates at 1 MiB instead of growing forever.

## 0.4.1

- Removed the temporary `/ppprobe` diagnostic.
- A typed `/polish` now fills the composer with the result, via the local `command/executed` event.
- The menu entry describes what it does and advertises the flag syntax.

## 0.4.0

- Drafts containing reference chips are refused instead of having those chips silently dropped.
- Strength chip (轻 / 中 / 重) next to ✨, remembered across reloads.
- The client sends an explicit `--light|--medium|--strong` flag, so a draft starting with a word like `light` is never consumed as a dial.

## 0.3.0

- Client half: ✨ control in the composer tool row, in-place `setDraft`, undo.
- Remote access tries four paths in order (`inject`, `ctx.get('remote.commands')`, `ctx.get('remote').commands`, `ctx.remote.commands`), each behind its own catch.

## 0.2.0

- Client module loads through the Web module loader; the draft is replaced only when it is still the text that was sent.

## 0.1.0

- Host-only `/polish` command: one auxiliary model call on the Session's model, returning the rewrite as the command result.
