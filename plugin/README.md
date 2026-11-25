# dsh-prompt-hone

DSH bundle half of the repository. See the [repository README](../README.md) for install and usage.

- `index.js` — Host: `/polish` (with `--light|--medium|--strong` and `--stats`), one auxiliary
  `ctx.llm.stream()` call on the Session's model.
- `client.js` — Web: the ✨ control, strength chip, selection handling, undo, and the Plugins-page card.
- `prompts.js` — the meta-prompt and the strength dial.
- `docs/DETAIL.md` — the page shown in Plugins.
- `locale/` — the plugin's title and description in the Plugin Manager.

Install with **Plugins → Add plugin**, pointing at this directory.
