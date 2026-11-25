/** Host-half tests for dsh-prompt-hone; no DSH runtime required. */
const PLUGIN = new URL('../plugin/', import.meta.url).href
const { apply } = await import(`${PLUGIN}index.js`)
const { buildRequest, buildUserPrompt, stripFence } = await import(`${PLUGIN}prompts.js`)

let failures = 0
function check(name, ok, detail) {
  if (ok) { console.log(`ok   ${name}`) ; return }
  failures++
  console.log(`FAIL ${name}${detail === undefined ? '' : '\n     ' + detail}`)
}

function harness({ config = {}, selection = { provider: 'p', model: 'm' }, chunks = [{ type: 'text-delta', text: '结果' }, { type: 'finish', reason: { kind: 'stop' } }], throws = null, hang = false, usage = undefined } = {}) {
  const seen = { calls: [], registered: [] }
  const ctx = {
    logger: { warn: message => seen.calls.push({ warn: message }) },
    effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
    commands: { register(definition) { seen.registered.push(definition); return () => {} } },
    llm: {
      async *stream(options) {
        seen.calls.push(options)
        if (throws !== null) throw throws
        if (hang) {
          // Never produce a chunk; settle only when the caller's signal aborts.
          await new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')))
          })
        }
        if (usage !== undefined) yield { type: 'usage', usage }
        for (const chunk of chunks) yield chunk
      },
    },
  }
  apply(ctx, config)
  const agent = { session: { id: 'session-test' }, model: { current: () => (selection === null ? undefined : selection) } }
  const definition = seen.registered.find(d => d.name === 'polish')
  const invoke = (rawInput, signal = new AbortController().signal) =>
    definition.handler({ agent, rawInput, signal, attachments: [], commandId: 'c1' })
  return { seen, invoke, definition }
}

// 1. default strength, route from the session model
{
  const h = harness()
  const r = await h.invoke('帮我把这段产品介绍改得更有说服力')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('registers exactly one command, polish', h.seen.registered.length === 1 && h.definition.name === 'polish')
  check('the menu description names the button', h.definition.description.includes('✨'))
  check('success result', r.kind === 'success' && r.text === '结果', JSON.stringify(r))
  check('uses the session model', call.provider === 'p' && call.model === 'm')
  check('medium token cap', call.maxTokens === 1600)
  check('system prompt attached', typeof call.system === 'string' && call.system.includes('提示词工程师'))
  check('user message carries the draft verbatim', call.messages[0].content[0].text.includes('帮我把这段产品介绍改得更有说服力'))
  check('one user message, text block only', call.messages.length === 1 && call.messages[0].role === 'user')
  check('purpose tagged', call.purpose === 'prompt-polish')
}

// 2. strength alias in Chinese + explicit light
{
  const h = harness()
  const r = await h.invoke('轻 把上面这段英文改成正式一点的语气')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('中文档位别名可用', r.kind === 'success' && call.maxTokens === 700, JSON.stringify(r))
  check('档位不残留在草稿里', call.messages[0].content[0].text.includes('<草稿>\n把上面这段英文') === true, call.messages[0].content[0].text)
}

// 3. strong
{
  const h = harness()
  await h.invoke('strong 写一个客服回复模板')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('strong token cap', call.maxTokens === 3200)
}

// 4. empty input never calls the model
{
  const h = harness()
  const r = await h.invoke('   ')
  check('empty draft is a usage error', r.kind === 'error' && r.text.includes('/polish'), JSON.stringify(r))
  check('empty draft makes no model call', h.seen.calls.filter(c => c.messages !== undefined).length === 0)
}

// 5. oversize input
{
  const h = harness()
  const r = await h.invoke('x'.repeat(6001))
  check('oversize draft rejected', r.kind === 'error' && r.text.includes('6000'), JSON.stringify(r))
  check('the oversize failure carries a code', r.text.startsWith('[TOO_LONG] '), r.text.slice(0, 20))
}

// 6. explicit route in config wins
{
  const h = harness({ config: { provider: 'deepseek', model: 'cheap-model' } })
  await h.invoke('随便改改')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('config route overrides the session model', call.provider === 'deepseek' && call.model === 'cheap-model')
}

// 7. partial config route is ignored, session model used
{
  const h = harness({ config: { provider: 'deepseek' } })
  const r = await h.invoke('随便改改')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('partial route falls back to the session model', r.kind === 'success' && call.provider === 'p', JSON.stringify(call?.provider))
}

// 8. no route at all
{
  const h = harness({ selection: null })
  const r = await h.invoke('随便改改')
  check('missing route is actionable', r.kind === 'error' && r.text.includes('模型选择器'), JSON.stringify(r))
  check('a host failure carries a stable code', r.text.startsWith('[NO_MODEL] '), r.text.slice(0, 20))
}

// 9. provider failure surfaces the code
{
  const h = harness({ chunks: [{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT' } } }] })
  const r = await h.invoke('随便改改')
  check('failure code surfaced', r.kind === 'error' && r.text.includes('RATE_LIMIT'), JSON.stringify(r))
}

// 10. thrown stream
{
  const h = harness({ throws: new Error('socket closed') })
  const r = await h.invoke('随便改改')
  check('thrown stream becomes an error result', r.kind === 'error' && r.text.includes('socket closed'), JSON.stringify(r))
}

// 11. empty model output
{
  const h = harness({ chunks: [{ type: 'finish', reason: { kind: 'stop' } }] })
  const r = await h.invoke('随便改改')
  check('empty output is an error', r.kind === 'error' && r.text.includes('没有返回内容'), JSON.stringify(r))
}

// 12. fenced output is unwrapped
{
  const h = harness({ chunks: [{ type: 'text-delta', text: '```markdown\n# 角色\n你是编辑\n```' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const r = await h.invoke('随便改改')
  check('code fence stripped', r.kind === 'success' && r.text === '# 角色\n你是编辑', JSON.stringify(r))
}

// 12b. a hung provider request is cut by the configured timeout
{
  const h = harness({ config: { timeoutMs: 20 }, hang: true })
  // AbortSignal.timeout uses an unref'd timer; keep the loop alive for it.
  const keepAlive = setTimeout(() => {}, 500)
  const r = await h.invoke('随便改改')
  clearTimeout(keepAlive)
  check('a hung request times out with an actionable message', r.kind === 'error' && r.text.includes('超时'), JSON.stringify(r))
}

// 13. upstream abort
{
  const controller = new AbortController()
  controller.abort()
  const h = harness({ throws: new Error('aborted') })
  const r = await h.invoke('随便改改', controller.signal)
  check('abort reported as cancellation', r.kind === 'error' && r.text.includes('取消'), JSON.stringify(r))
}

// 12c. --stats answers without a model call, and reports the remembered usage
{
  const h = harness({ usage: { inputTokens: 820, outputTokens: 460, totalTokens: 1280 } })
  await h.invoke('把这段改好')
  const stats = await h.invoke('--stats')
  const parsed = JSON.parse(stats.text)
  check('--stats spends no model call', h.seen.calls.filter(c => c.messages !== undefined).length === 1)
  check('--stats reports the route', parsed.route?.provider === 'p' && parsed.route?.model === 'm', stats.text)
  check('--stats reports the last usage', parsed.usage?.inputTokens === 820 && parsed.usage?.outputTokens === 460, stats.text)
  check('--stats reports the limits', parsed.timeoutMs === 120000 && parsed.maxInputChars === 6000 && parsed.strength === 'medium', stats.text)
}

// 12d. style presets add their directive to the system prompt
{
  const h = harness()
  await h.invoke('--style=social 写条产品介绍')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('a style preset reaches the system prompt', call.system.includes('social platform post'), call.system.slice(-60))
  check('the style flag is not left in the draft', call.messages[0].content[0].text.includes('<草稿>\n写条产品介绍'))
}
{
  const h = harness()
  await h.invoke('--style=general 随便改改')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('the general style adds nothing', !call.system.includes('Style target'), call.system.slice(-40))
}

// 13b. explicit strength flags (what the Client sends)
{
  const h = harness()
  const r = await h.invoke('--strong 写一个客服回复模板')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('--strong flag selects the strong budget', r.kind === 'success' && call.maxTokens === 3200, JSON.stringify(r))
  check('the flag is not left in the draft', call.messages[0].content[0].text.includes('<草稿>\n写一个客服回复模板'))
}
{
  const h = harness()
  await h.invoke('--light 把语气改正式')
  const call = h.seen.calls.find(c => c.messages !== undefined)
  check('--light flag selects the light budget', call.maxTokens === 700)
}
check('an unknown flag stays in the draft', buildRequest('--zz  某草稿', { strength: 'medium', maxInputChars: 6000 }).text === '--zz  某草稿')
check('a human-typed word alias still works', buildRequest('轻 把语气改正式', { strength: 'medium', maxInputChars: 6000 }).strength === 'light')

// 14. pure helpers
check('buildRequest keeps variable names', buildRequest('把 {{topic}} 扩写成大纲', { strength: 'medium', maxInputChars: 6000 }).text === '把 {{topic}} 扩写成大纲')
check('stripFence leaves plain text alone', stripFence('  纯文本  ') === '纯文本')
check('buildUserPrompt wraps the draft', buildUserPrompt({ text: 'abc', strength: 'light' }).includes('<草稿>\nabc\n</草稿>'))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
