---
name: prompt-polisher
description: Rewrite a rough draft into a clearer, executable prompt without changing the user's intent. Use when the user says 润色提示词、改写提示词、帮我写个提示词、把这段话变成提示词、这个 prompt 怎么优化、prompt 太模糊帮我改清楚, or asks to polish / tighten / restructure / fix a prompt for any model. Also use before running an important task when the user's request is vague and they want it turned into a reusable prompt.
---

# Prompt polisher

Turn what the user actually wrote into a prompt an AI can execute, and stop there.
This skill is about the **prompt as a deliverable**. If the user wants the task done,
do the task — don't hand back a prompt instead of an answer.

## Output contract

- Return **only** the rewritten prompt. No preamble, no "以下是优化后的版本", no explanation of what you changed, no code fence around it.
- Keep the user's language: a Chinese draft becomes a Chinese prompt, English stays English, mixed stays mixed.
- Preserve verbatim: proper nouns, variable names (`{{topic}}`), field names, paths, commands, code, numbers.
- If asked to explain the changes, put the explanation **after** a blank line and a `---` divider, never before.

## Hard rules

1. **Do not invent facts.** No new numbers, links, names, dates, products, or requirements. Missing information becomes `[待补充: 具体缺什么]`.
2. **Do not change the task type.** A question stays a question, a task stays a task, a role-play stays a role-play.
3. **No filler.** Lines like 「请认真思考」「作为一个资深专家」「务必高质量」 are forbidden — they cannot be executed or verified.
4. **If the draft is already good, return it unchanged.** Never edit for the sake of editing.
5. **Length follows the strength dial**, never padding.

## Strength dial

Default to **medium** unless the user asks otherwise.

| dial | may change | length |
|---|---|---|
| light | wording clarity, minimal structure | same as the draft |
| medium | add goal, key constraints, output format; light restructuring | 1.5–2× |
| strong | full structure, variables, acceptance criteria | 2–4× |

Ask once, only if the dial materially changes the result and the user gave no signal.

## Structure skeleton (use what the task needs, not all of it)

- **角色/任务**: who the AI is, and the one thing it must do
- **输入**: what it receives; mark the variable parts
- **约束**: must / must-not / boundaries — written as checkable sentences
- **输出**: shape of the deliverable (format, length, language, structure)
- **验收**: what "done" looks like

Short tasks need two of these; long or automated ones usually need all five.

## Self-check before answering (do not print it)

- Can the task be restated in one sentence? If not, the goal is still vague.
- Is every constraint checkable? Rewrite or drop the ones that are not.
- Is the output format specified? If the user will paste the result somewhere, it matters.
- Does any sentence contain an undefined pronoun or ambiguous reference?
- Would the original author recognise their intent? If not, cut what you added.

## Example

Draft: 「帮我把这段产品介绍改得更有说服力，给小红书用」

Medium rewrite:

```
你是小红书内容编辑。把用户提供的产品介绍改写成一条小红书笔记。

输入：{{产品介绍}}
约束：
- 保留原文中的功能点与价格，不新增任何未提及的卖点
- 首句用使用场景切入，不写"大家好"
- 全文不出现"最""第一""国家级"等绝对化用语
输出格式：
- 标题（20 字内）+ 正文（300-500 字）+ 3-5 个话题标签
- 分段短句，每段不超过 2 行
验收：读者能在 5 秒内知道这是什么产品、适合谁。
```

## Related

The DSH plugin [dsh-prompt-polisher](https://github.com/Miles22ui/dsh-prompt-polisher) applies these same
rules to the composer draft, in place, with undo and a strength dial. This skill covers hosts that have no
composer to write into.

## Boundaries

- Not a copywriter: do not write marketing copy, only the prompt that produces it.
- Not a fact-checker: do not add "facts" to strengthen a weak prompt.
- Not a formatter: if the user wants the prompt saved to a file or the composer, that is a different tool's job.
