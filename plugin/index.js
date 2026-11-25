/**
 * Host half of the prompt polisher: one `/polish` command that rewrites the
 * draft the user typed. The rewrite runs as a single auxiliary model call on
 * the Session's currently selected model, so no separate model configuration is
 * required.
 *
 * Phase B (this file): the command returns the rewrite as its result text.
 * Phase A adds a Client module that reads the same result and replaces the
 * composer draft in place.
 *
 * Diagnostics: every stage of a `/polish` run appends one line (never the draft
 * itself) to TRACE_FILE, so a silent stall can be located from outside the app.
 */
import { appendFileSync, statSync, writeFileSync } from 'node:fs'
import { STRENGTHS, STYLE_IDS, buildRequest, buildUserPrompt, stripFence, SYSTEM_PROMPT } from './prompts.js'

export const name = 'prompt-polisher'

/** Services this plugin needs before it activates. */
export const inject = ['commands', 'llm']

/** Provider-neutral purpose tag carried to the adapter as hidden metadata. */
const PURPOSE = 'prompt-polish'

/** Stage log read with a plain file read; contains no draft text. */
const TRACE_FILE = '/tmp/prompt-hone-trace.log'

/** The trace is diagnostics, not history: rotate it instead of growing forever. */
const TRACE_MAX_BYTES = 1024 * 1024

/**
 * Combine the caller's cancellation with a hard end-to-end timeout, so one
 * stalled provider request cannot hold a composer forever.
 * @param signal - the invocation's cancellation signal.
 * @param timeoutMs - deadline for the whole rewrite.
 * @returns a signal that aborts on either.
 */
function composeSignal(signal, timeoutMs) {
  try {
    if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
      return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    }
  } catch (_error) {
    // Older runtime: keep the caller's signal alone.
  }
  return signal
}

/**
 * Append one diagnostic line; tracing must never break the command.
 * @param stage - short stage name.
 * @param detail - non-sensitive detail (lengths, codes, booleans).
 */
function trace(stage, detail = '') {
  try {
    const stat = statSync(TRACE_FILE, { throwIfNoEntry: false })
    if (stat !== undefined && stat.size > TRACE_MAX_BYTES) writeFileSync(TRACE_FILE, '')
    appendFileSync(TRACE_FILE, `${new Date().toISOString()} ${stage} ${detail}\n`)
  } catch (_error) {
    // Tracing is best effort.
  }
}

/** Last auxiliary-call usage per Session, newest last; bounded so it cannot grow. */
const usageBySession = new Map()
const USAGE_MEMORY = 64

/**
 * Remember one call's token usage for the `--stats` read.
 * @param sessionId - receiving Session id, when known.
 * @param usage - the stream's usage block.
 */
function rememberUsage(sessionId, usage) {
  if (sessionId === undefined || usage === undefined) return
  usageBySession.delete(sessionId)
  usageBySession.set(sessionId, {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    at: Date.now(),
  })
  while (usageBySession.size > USAGE_MEMORY) {
    const oldest = usageBySession.keys().next().value
    if (oldest === undefined) break
    usageBySession.delete(oldest)
  }
}

/** `--stats` reports route and limits without spending a model call. */
const STATS_FLAG = '--stats'

/**
 * Register the command for the lifetime of the plugin.
 * @param ctx - Host plugin context.
 * @param config - the bundle patch's `config` object, unvalidated.
 */
export function apply(ctx, config = {}) {
  const settings = {
    strength: STRENGTHS.includes(config?.strength) ? config.strength : 'medium',
    provider: typeof config?.provider === 'string' && config.provider !== '' ? config.provider : undefined,
    model: typeof config?.model === 'string' && config.model !== '' ? config.model : undefined,
    maxInputChars: Number.isInteger(config?.maxInputChars) ? config.maxInputChars : 6000,
    timeoutMs: Number.isInteger(config?.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 120000,
    style: STYLE_IDS.includes(config?.style) ? config.style : 'general',
  }
  if ((settings.provider === undefined) !== (settings.model === undefined)) {
    ctx.logger.warn('prompt-polisher: provider and model must be set together; ignoring the partial route')
    settings.provider = undefined
    settings.model = undefined
  }
  trace('boot', `strength=${settings.strength} route=${settings.provider ?? 'session'}`)
  ctx.commands.register({
    name: 'polish',
    description: 'Polish the composer draft (提示词打磨，等同 ✨)',
    input: { hint: '[--light|--medium|--strong] <草稿>' },
    handler: invocation => polish(ctx, settings, invocation),
  })
}

/**
 * Rewrite one draft through the Session's model. Every failure path returns a
 * visible result: an empty-text error renders as nothing, which is
 * indistinguishable from a bug.
 * @param ctx - Host plugin context.
 * @param settings - validated plugin settings.
 * @param invocation - the admitted command invocation.
 * @returns the rewrite as success text, or an actionable error.
 */
async function polish(ctx, settings, invocation) {
  try {
    trace('handler', `chars=${String(invocation.rawInput ?? '').length} style=${settings.style}`)
    if (String(invocation.rawInput ?? '').trim().startsWith(STATS_FLAG)) {
      const selection = resolveRoute(invocation.agent, settings)
      const sessionId = invocation.agent?.session?.id
      return {
        kind: 'success',
        text: JSON.stringify({
          route: selection ?? null,
          timeoutMs: settings.timeoutMs,
          maxInputChars: settings.maxInputChars,
          strength: settings.strength,
          usage: usageBySession.get(sessionId) ?? null,
        }),
      }
    }
    const request = buildRequest(invocation.rawInput, settings)
    if (request.error !== undefined) return { kind: 'error', text: request.error }
    const route = resolveRoute(invocation.agent, settings)
    if (route === undefined) {
      trace('route', 'none')
      return {
        kind: 'error',
        text: '[NO_MODEL] 没有可用的模型：先在输入框的模型选择器里选一个模型，或在插件配置里同时设置 provider 与 model。',
      }
    }
    trace('route', `${route.provider}/${route.model} maxTokens=${request.maxTokens} style=${request.style.id}`)
    return await streamRewrite(ctx, settings, invocation, request, route)
  } catch (error) {
    trace('threw', errorText(error))
    return { kind: 'error', text: `[FAILED] 润色失败：${errorText(error)}` }
  }
}

/**
 * Run the single auxiliary model call and normalize its outcome.
 * @param ctx - Host plugin context.
 * @param settings - validated plugin settings.
 * @param invocation - the admitted command invocation.
 * @param request - validated request.
 * @param route - provider/model pair to call.
 * @returns the polish result.
 */
async function streamRewrite(ctx, settings, invocation, request, route) {
  const signal = composeSignal(invocation.signal, settings.timeoutMs)
  let output = ''
  let reason
  let usage
  try {
    for await (const chunk of ctx.llm.stream({
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      system: request.style.directive === ''
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT}\n\n${request.style.directive}`,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildUserPrompt(request) }] }],
      maxTokens: request.maxTokens,
      signal,
      purpose: PURPOSE,
    })) {
      if (chunk.type === 'text-delta') output += chunk.text
      else if (chunk.type === 'usage') usage = chunk.usage
      else if (chunk.type === 'finish') reason = chunk.reason
    }
  } catch (error) {
    if (invocation.signal.aborted) {
      trace('aborted')
      return { kind: 'error', text: '[CANCELLED] 润色已取消。' }
    }
    if (signal.aborted) {
      trace('timeout', `ms=${settings.timeoutMs}`)
      return { kind: 'error', text: `[TIMEOUT] 润色超时（${Math.round(settings.timeoutMs / 1000)} 秒），请重试。` }
    }
    trace('stream-threw', errorText(error))
    return { kind: 'error', text: `[FAILED] 润色失败：${errorText(error)}` }
  }
  rememberUsage(invocation.agent?.session?.id, usage)
  trace('stream-end', `chars=${output.length} reason=${reason?.kind ?? 'none'} tokens=${usage?.totalTokens ?? usage?.outputTokens ?? '?'}`)
  if (reason !== undefined && reason.kind !== 'stop' && reason.kind !== 'max-tokens') {
    return { kind: 'error', text: `[PROVIDER_FAILED] 润色失败：${failureText(reason)}` }
  }
  if (reason !== undefined && reason.kind === 'max-tokens') {
    ctx.logger.warn('prompt-polisher: output reached the token cap; the rewrite may be truncated')
  }
  const text = stripFence(output)
  if (text === '') {
    trace('empty')
    return { kind: 'error', text: '[EMPTY] 模型没有返回内容，请重试。' }
  }
  trace('result', `chars=${text.length}`)
  return { kind: 'success', text }
}

/**
 * Pick the route for the auxiliary call: an explicit configuration pair first,
 * otherwise the Session's current model selection.
 * @param agent - receiving agent of the command.
 * @param settings - validated plugin settings.
 * @returns the provider/model route, or undefined when none resolves.
 */
function resolveRoute(agent, settings) {
  if (settings.provider !== undefined && settings.model !== undefined) {
    return { provider: settings.provider, model: settings.model }
  }
  let current
  try {
    current = agent?.model?.current?.()
  } catch (_error) {
    return undefined
  }
  if (current === undefined || current === null) return undefined
  if (typeof current.provider !== 'string' || typeof current.model !== 'string') return undefined
  return current
}

/**
 * Describe a terminal failure without echoing provider payloads.
 * @param reason - the finish reason of the terminal chunk.
 * @returns a short code, plus the failure message when the adapter supplied one.
 */
function failureText(reason) {
  if (reason?.kind === 'aborted') return '已取消'
  const failure = reason?.failure
  const code = typeof failure?.code === 'string' ? failure.code : 'ERROR'
  const detail = typeof failure?.message === 'string' && failure.message !== '' ? `：${failure.message}` : ''
  return `${code}${detail}`
}

/**
 * Render an unknown thrown value as one line.
 * @param error - thrown value.
 * @returns its message, or its string form.
 */
function errorText(error) {
  if (error instanceof Error && error.message !== '') return error.message
  return String(error)
}
