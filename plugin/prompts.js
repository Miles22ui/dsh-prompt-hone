/**
 * The rewriting contract: strengths, usage text, and the meta-prompt that turns
 * a rough draft into an executable prompt. Kept apart from the Host wiring so
 * the wording can be tuned without touching the command.
 */

/** Supported strengths, weakest first. */
export const STRENGTHS = ['light', 'medium', 'strong']

/** One-line usage shown when the command receives no draft. */
export const USAGE = '用法：/polish [--light|--medium|--strong] <要润色的草稿>'

/**
 * Explicit strength flags. The Client always sends one of these so a draft that
 * happens to start with a word like "light" or "轻" is never consumed as a
 * strength token.
 */
const FLAGS = new Map([['--light', 'light'], ['--medium', 'medium'], ['--strong', 'strong']])

/** Localized names accepted as the leading strength token (human-typed commands). */
const ALIASES = new Map([
  ['light', 'light'], ['medium', 'medium'], ['strong', 'strong'],
  ['轻', 'light'], ['中', 'medium'], ['重', 'strong'],
  ['轻改', 'light'], ['精修', 'medium'], ['重写', 'strong'],
])

/** Output cap per strength; light rewrites stay close to the draft's length. */
const MAX_TOKENS = { light: 700, medium: 1600, strong: 3200 }

/** One-line description of what each strength is allowed to change. */
const STRENGTH_LABEL = {
  light: '只修清晰度与最小结构，不新增段落，长度与原稿相当',
  medium: '补齐目标、关键约束与输出格式，允许适度重组，长度约为原稿的 1.5-2 倍',
  strong: '完整结构化（角色/目标/输入/约束/输出格式/验收标准），必要时给变量占位符，长度可为原稿的 2-4 倍',
}

/**
 * The meta-prompt. The rules are deliberately short and testable: every line
 * either forbids a known failure mode (inventing facts, meta commentary,
 * padding) or asks for something a reviewer can check.
 */
export const SYSTEM_PROMPT = `你是提示词工程师。用户给你一段草稿，你把它改写成可以直接交给 AI 执行的提示词。

硬性规则：
1. 只输出改写后的提示词正文。不要开场白、不要解释、不要"以下是"、不要用代码围栏包裹。
2. 保留原意与任务类型：问句仍是问句，任务仍是任务。不新增用户没提过的事实、数据、链接、人名、时间。
3. 保留用户的语言：中文草稿输出中文，英文草稿输出英文，中英混排保持原样。
4. 专有名词、变量名、字段名、路径、命令、代码片段一律原样保留，不要翻译或改写。
5. 不写空话：「请认真思考」「作为一个资深专家」「务必高质量」这类不能执行也不能验证的句子不要出现。
6. 缺少关键信息时，用 [待补充: 具体缺什么] 标注，不要编造。
7. 如果草稿本身已经足够好，直接原样返回，不要为了改动而改动。

改写时按这个顺序思考（内部执行，不要输出思考过程）：
- 任务：用户到底要 AI 做什么？一句话说不清就先说清。
- 输入：AI 手上有什么？哪些是变量、哪些是固定要求？
- 约束：必须/禁止/边界条件，写成可检验的句子。
- 输出：交付物的形状（格式、长度、语言、结构）。
- 验收：什么情况下算做好了。

强度档：
- light：${STRENGTH_LABEL.light}。
- medium：${STRENGTH_LABEL.medium}。
- strong：${STRENGTH_LABEL.strong}。`

/**
 * Split a raw command input into the effective draft and the requested strength.
 * @param rawInput - text after the command name, verbatim.
 * @param settings - effective plugin settings (`strength`, `maxInputChars`).
 * @returns the draft to rewrite, its strength and token cap, or a usage error.
 */
export function buildRequest(rawInput, settings) {
  let text = String(rawInput ?? '').trim()
  if (text === '') return { error: USAGE }
  let strength = settings.strength
  const flag = /^(--[a-z]+)\s+/.exec(text)
  if (flag !== null && FLAGS.has(flag[1])) {
    strength = FLAGS.get(flag[1])
    text = text.slice(flag[0].length).trim()
  } else {
    const leading = /^(\S+)\s+/.exec(text)
    if (leading !== null && ALIASES.has(leading[1])) {
      strength = ALIASES.get(leading[1])
      text = text.slice(leading[0].length).trim()
    }
  }
  if (text === '') return { error: USAGE }
  if (text.length > settings.maxInputChars) {
    return { error: `草稿 ${text.length} 字符，超过上限 ${settings.maxInputChars}，请分段润色。` }
  }
  return { text, strength, maxTokens: MAX_TOKENS[strength] ?? MAX_TOKENS.medium }
}

/**
 * Build the single user message carrying the draft.
 * @param request - validated request from {@link buildRequest}.
 * @returns the user-message text.
 */
export function buildUserPrompt(request) {
  return `强度档：${request.strength}（${STRENGTH_LABEL[request.strength]}）\n\n<草稿>\n${request.text}\n</草稿>`
}

/**
 * Drop a wrapping Markdown code fence the model may add despite instructions.
 * @param output - raw accumulated model text.
 * @returns the trimmed prompt text.
 */
export function stripFence(output) {
  const text = String(output ?? '').trim()
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(text)
  return (fenced === null ? text : fenced[1]).trim()
}
