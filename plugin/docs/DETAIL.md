# 提示词打磨器（Prompt hone）

在输入框里随手写的草稿，点一下 ✨ 就原地变成更清晰、更可执行的提示词；不满意一键撤销。

## 用法

1. 在输入框写草稿（不必写完，写个方向也行）
2. 点输入框右下、发送键左边的 **✨**
3. 草稿被替换为改写结果，旁边出现「撤销」
4. 可继续编辑，或直接发送

✨ 右侧的 **中 / 轻 / 重** 是强度档，点击切换并记住选择。界面语言可在 Plugins 详情页的配置卡里切换（自动 / 中文 / English）。

- **先预览**：结果不会直接覆盖，输入框下方显示改写文本，由你点「应用」或「放弃」
- **只润一段**：选中文字再点 ✨，只替换选区（编辑器原生撤销）
- **历史**：点 ⟲ 查看最近 8 次已应用的改写，可恢复原稿
- **取消**：润色中再点一次 ✨；60 秒无返回自动超时
- **键盘**：`/polish --strong <草稿>`，结果自动填回输入框；失败会在按钮旁显示原因
- **用量**：成功后悬停 ✨ 可看上次的输入/输出 token（Host 的 `--stats` 回答，不调模型）
- **设置**：Plugins 详情页的配置卡可改默认强度与客户端超时，改完输入框旁的档位立即同步；模型路由、Host 超时、输入上限只读展示，并附一段带占位符的可复制 YAML

命令写法：

```
/polish --strong 帮我把这段产品介绍改得更有说服力，给小红书用
/polish --light 把上面这段英文改成正式一点的语气
```

`light`（轻改，长度基本不变）/ `medium`（默认，补齐目标、约束、输出格式）/ `strong`（完整结构化，可含变量占位符），也可写 `轻` / `中` / `重`。

## 它用的模型

默认用**输入框里当前选中的模型**，不需要单独配置。想固定走某个便宜快的模型，在 `cordis.patch.yml` 的 `config` 里同时写 `provider` 和 `model`（只写一个会被忽略）。

## 安全边界

- 只有草稿**自你点击后未被改动**时才会写回；期间你改了字，它就只提示「草稿已改动，未覆盖」，不会覆盖你的输入。
- 草稿含引用胶囊（文件 / Session 引用）时**不会替换**，会提示「草稿含引用，未替换」——整段替换会冲掉引用，宁可不动。
- 每次润色都是一次真实模型请求，产生 token 费用；草稿会发给你选中的模型服务商。
- 输入上限 6000 字符（config 的 `maxInputChars` 可调）。

## 诊断（出问题时）

- 命令结果本身不会出现在对话里（DSH 现状），插件是靠客户端的 `command/executed` 事件把文本填回输入框的。
- 插件会把每个阶段写到 `/tmp/prompt-hone-trace.log`（只记字符数和错误码，不记草稿内容）：
  - 有 `boot` 无 `handler`：命令没派发到 Host
  - 有 `handler` 无 `result`：模型调用失败，看 `stream-threw` / `stream-end`
  - 有 `result`：Host 侧成功，问题在客户端呈现
- `/polish` 的结果不进对话流；键盘路径靠客户端监听 `command/executed` 把文本填回输入框，期间你若已开始打字则不会覆盖。


---

# Prompt hone (English)

Click ✨ beside Send and the draft in the composer becomes a structured, executable prompt, in place.
Nothing reaches the model unless you send it.

## Usage

1. Write a draft in the composer — a direction is enough.
2. Click **✨** next to the Send button.
3. The draft is replaced; **Undo** restores it.
4. Keep editing, or send.

The **light / medium / strong** chip next to ✨ switches strength (remembered across reloads).
The interface language (Auto / 中文 / English) is on the plugin's page under **Plugins**.

- **Preview first** — the rewrite opens as plain text under the composer; **Apply** or **Discard**
- **Selection only** — select text first and only that passage is rewritten (native Ctrl/Cmd+Z)
- **History** — the ⟲ chip lists the last 8 applied rewrites, each restorable
- **Cancel** — click ✨ again while it runs; a 60 s deadline also applies
- **Keyboard** — `/polish --strong <draft>`: the composer clears, then the rewrite is filled back in
- **Usage** — hover ✨ after a run for the last call's input/output tokens (a Host `--stats` read, no model call)
- **Settings** — the plugin page can change the interface language, default strength and client timeout;
  model route, Host timeout and input limit are read-only, with a copyable YAML snippet

## Which model it uses

The model already selected in the composer. No separate configuration is needed; to pin a model, set
both `provider` and `model` in the plugin's `config` (setting only one is ignored).

## Safety boundaries

- The draft is written back only if it has not changed since you clicked; otherwise it reports the change
  and leaves your text alone.
- Drafts containing file / Session reference chips are **not** replaced — a whole-draft replacement would
  drop those chips.
- Every run is one real model request and is billed as such; the draft is sent to your provider.
- Input limit is 6000 characters (`maxInputChars`).
