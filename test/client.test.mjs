/** Client-half tests for dsh-prompt-hone; a fake module loader and fake hooks. */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../plugin/client.js', import.meta.url), 'utf8')
let failures = 0
function check(name, ok, detail) {
  if (ok) { console.log(`ok   ${name}`); return }
  failures++
  console.log(`FAIL ${name}${detail === undefined ? '' : '\n     ' + detail}`)
}

// Minimal hook runtime: enough to render once and observe state writes.
let slots = []
let cursor = 0
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  // useRef must survive re-renders, exactly like React: keep it in the same slot table.
  useEffect: (fn) => { const cleanup = fn(); if (typeof cleanup === 'function') effectCleanups.push(cleanup) },
  useRef: (value) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = { current: value }
    return slots[index]
  },
  useState: (initial) => {
    const index = cursor++
    // React calls a lazy initializer; the fake must too.
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
  },
}

const store = new Map()
const loaded = []
const windowListeners = new Map()
globalThis.window = {
  __ModuleLoader__: { load({ id, factory }) { loaded.push({ id, module: factory(name => (name === 'react' ? react : undefined)) }) } },
  addEventListener: (name, fn) => {
    if (!windowListeners.has(name)) windowListeners.set(name, new Set())
    windowListeners.get(name).add(fn)
  },
  removeEventListener: (name, fn) => { windowListeners.get(name)?.delete(fn) },
  dispatchEvent: (event) => { for (const fn of windowListeners.get(event.type) ?? []) fn(event) },
  localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value) },
  },
}
await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'))

check('registers one client module', loaded.length === 1 && loaded[0].id === 'dsh-prompt-hone')
const mod = loaded[0].module
check('injects slots and remote', mod.inject.includes('slots') && mod.inject.includes('remote'))

const registrations = []
const remoteCalls = []
let executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
const setDraftCalls = []

const handlers = {}
const effectCleanups = []
const ctx = {
  on: (name, fn) => { handlers[name] = fn; return () => { delete handlers[name] } },
  slots: {
    inject(name, callback) { registrations.push({ name }); callback(); return () => {} },
    register(options, component) { registrations.push({ options, component }); return () => {} },
  },
  remote: { commands: { execute: (...args) => { remoteCalls.push(args); return executeImpl({ signal: args[3], line: args[1] }) } } },
}
// Cordis hands a scope whose declared services resolve; the fake uses the same object.
ctx.inject = (deps, callback) => { callback(ctx); return { dispose: () => {} } }
ctx.get = name => (name === 'remote'
  ? ctx.remote
  : name === 'remote.commands' ? ctx.remote.commands : undefined)
mod.apply(ctx)
const registration = registrations.find(r => r.options !== undefined)
const Control = registration.component

function collectText(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out }
  if (typeof node === 'object') {
    for (const child of node.children ?? []) collectText(child, out)
    if (typeof node.props?.title === 'string') out.push(node.props.title)
  }
  return out
}
function findButton(node, matcher) {
  if (node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) { for (const child of node) { const hit = findButton(child, matcher); if (hit) return hit } return undefined }
  if (node.type === 'button' && matcher(node)) return node
  for (const child of node.children ?? []) { const hit = findButton(child, matcher); if (hit) return hit }
  return undefined
}

/** One render pass: hooks are indexed once, so state writes stay observable. */
function render({ draft = '把这段改得更有说服力', phase = 'plain', locked = false, actions = undefined } = {}) {
  cursor = 0
  const tree = Control({
    useInput: selector => selector({ draft, phase, occurrences: [] }),
    inputActions: actions ?? { setDraft: value => setDraftCalls.push(value) },
    sessionId: 'session-x',
    locked,
  })
  return { tree, text: collectText(tree) }
}
/** Collect rendered text only; `collectText` also folds in tooltip titles. */
function visibleText(node, out = []) {
  if (node === null || node === undefined) return out.join('')
  if (typeof node === 'string') { out.push(node); return out.join('') }
  if (Array.isArray(node)) { for (const child of node) visibleText(child, out); return out.join('') }
  if (typeof node === 'object') for (const child of node.children ?? []) visibleText(child, out)
  return out.join('')
}

function statusText(tree) {
  const node = (function find(candidate) {
    if (candidate === null || typeof candidate !== 'object') return undefined
    if (Array.isArray(candidate)) {
      for (const child of candidate) { const hit = find(child); if (hit) return hit }
      return undefined
    }
    if (candidate.props?.role === 'status') return candidate
    for (const child of candidate.children ?? []) { const hit = find(child); if (hit) return hit }
    return undefined
  })(tree)
  return node === undefined ? '' : visibleText(node)
}

function sparkleButton(tree) {
  return findButton(tree, node => ['润色提示词', '取消润色'].includes(node.props?.['aria-label']))
}

// 1. success: replaces the draft, no error
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  const after = render().text.join(' | ')
  check('success replaces the draft', setDraftCalls.length === 1 && setDraftCalls[0] === '改写结果', JSON.stringify(setDraftCalls))
  check('success shows no error', !after.includes('失败'), after)
  check('sends the draft with an explicit strength flag', remoteCalls[0]?.[1] === '/polish --medium 把这段改得更有说服力', JSON.stringify(remoteCalls[0]?.[1]))
  check('offers undo after success', after.includes('撤销'), after)
}

// 2. envelope failure
{
  slots = []; setDraftCalls.length = 0
  executeImpl = async () => ({ ok: false, error: { code: 'NO_AGENT', message: 'boom' } })
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  const text = render().text.join(' | ')
  check('envelope error surfaced with code and message', text.includes('NO_AGENT') && text.includes('boom'), text)
  check('no draft write on failure', setDraftCalls.length === 0)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 3. unknown command (undefined)
{
  slots = []
  executeImpl = async () => undefined
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  const text = render().text.join(' | ')
  check('undefined outcome reports an unregistered command', text.includes('命令未注册'), text)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 4. malformed value
{
  slots = []
  executeImpl = async () => ({ ok: true, value: undefined })
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  check('missing value reports an empty answer', render().text.join(' ').includes('命令未注册或返回为空'), render().text.join(' '))
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 5. host-side handler error text
{
  slots = []
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'error', text: '草稿 7000 字符，超过上限 6000' } } })
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  check('handler error text shown verbatim', render().text.join(' ').includes('超过上限'), render().text.join(' '))
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 6. thrown call names the step
{
  slots = []
  executeImpl = async () => { throw new Error('Cannot read properties of undefined') }
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  const text = render().text.join(' ')
  check('thrown call reports its step and message', text.includes('execute 失败') && text.includes('Cannot read properties'), text)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 6b. a raw CommandResult (no envelope) is accepted too
{
  slots = []; setDraftCalls.length = 0
  executeImpl = async () => ({ kind: 'success', text: '裸形状结果' })
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  check('raw result shape still replaces the draft', setDraftCalls[0] === '裸形状结果', JSON.stringify(setDraftCalls))
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 7. draft edited while the model works
{
  slots = []; setDraftCalls.length = 0
  let release
  executeImpl = () => new Promise(resolve => { release = resolve })
  const { tree } = render({ draft: '原始草稿' })
  const pending = sparkleButton(tree).props.onClick()
  render({ draft: '我改成了别的' })   // user types while busy
  release({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
  await pending
  check('edits made during the call are never overwritten', setDraftCalls.length === 0)
  check('a changed draft is reported', render({ draft: '我改成了别的' }).text.join(' ').includes('草稿已改动'), render({ draft: '我改成了别的' }).text.join(' '))
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 8. missing remote namespace
{
  slots = []
  const brokenControls = []
  mod.apply({
    on: () => () => {},
    slots: {
      inject: (name, callback) => { callback() },
      register: (options, component) => { brokenControls.push(component); return () => {} },
    },
  })
  const BrokenControl = brokenControls[0]
  const renderBroken = () => {
    cursor = 0
    return collectText(BrokenControl({
      useInput: selector => selector({ draft: 'x', phase: 'plain' }),
      inputActions: { setDraft: () => { throw new Error('should not write') } },
      sessionId: 's', locked: false,
    })).join(' ')
  }
  const probeTree = (() => {
    cursor = 0
    return BrokenControl({
      useInput: selector => selector({ draft: 'x', phase: 'plain' }),
      inputActions: { setDraft: () => {} },
      sessionId: 's', locked: false,
    })
  })()
  await sparkleButton(probeTree).props.onClick()
  const after = renderBroken()
  check('missing remote names the accessors it tried', after.includes('通道不可用') && after.includes('remote.commands'), after)
}

// 8b. a service tracker that throws on access is reported, not swallowed
{
  slots = []
  const throwingControls = []
  const throwingCtx = {
    on: () => () => {},
    slots: { inject: (n, cb) => { cb() }, register: (o, c) => { throwingControls.push(c); return () => {} } },
    get remote() { throw new Error('service "remote" is not available') },
  }
  mod.apply(throwingCtx)
  const ThrowingControl = throwingControls[0]
  const makeTree = () => {
    cursor = 0
    return ThrowingControl({
      useInput: selector => selector({ draft: 'x', phase: 'plain' }),
      inputActions: { setDraft: () => {} },
      sessionId: 's', locked: false,
    })
  }
  await sparkleButton(makeTree()).props.onClick()
  cursor = 0
  const after = collectText(makeTree()).join(' ')
  check('throwing service reports the accessor that threw', after.includes('通道不可用') && after.includes('ctx.remote'), after)
}

// 8c. only `remote.commands` is reachable, like a namespaced Cordis service
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  const namespaceControls = []
  const namespaceCtx = {
    on: () => () => {},
    slots: { inject: (n, cb) => { cb() }, register: (o, c) => { namespaceControls.push(c); return () => {} } },
    get: name => (name === 'remote.commands'
      ? { execute: (...args) => { remoteCalls.push(args); return executeImpl(...args) } }
      : undefined),
    inject: () => ({}),
  }
  mod.apply(namespaceCtx)
  const NamespaceControl = namespaceControls[0]
  const makeTree = () => {
    cursor = 0
    return NamespaceControl({
      useInput: selector => selector({ draft: '命名空间草稿', phase: 'plain' }),
      inputActions: { setDraft: value => setDraftCalls.push(value) },
      sessionId: 's', locked: false,
    })
  }
  await sparkleButton(makeTree()).props.onClick()
  check('a namespace-only Remote still works', setDraftCalls[0] === '改写结果', JSON.stringify(setDraftCalls))
}

// 8d. a draft with reference chips is never replaced (setDraft would drop them)
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  cursor = 0
  const tree = Control({
    useInput: selector => selector({ draft: '看看 @file.ts 这个', phase: 'plain', occurrences: [{ offset: 3 }] }),
    inputActions: { setDraft: value => setDraftCalls.push(value) },
    sessionId: 'session-x', locked: false,
  })
  await sparkleButton(tree).props.onClick()
  check('drafts with references are left untouched', setDraftCalls.length === 0 && remoteCalls.length === 0)
  cursor = 0
  const after = collectText(Control({
    useInput: selector => selector({ draft: '看看 @file.ts 这个', phase: 'plain', occurrences: [{ offset: 3 }] }),
    inputActions: { setDraft: () => {} },
    sessionId: 'session-x', locked: false,
  })).join(' ')
  check('the refusal explains why', after.includes('草稿含引用'), after)
}

// 8e. the strength chip cycles and the chosen flag is sent
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0; store.clear()
  const makeTree = (draft) => {
    cursor = 0
    return Control({
      useInput: selector => selector({ draft, phase: 'plain', occurrences: [] }),
      inputActions: { setDraft: value => setDraftCalls.push(value) },
      sessionId: 'session-x', locked: false,
    })
  }
  const findChip = tree => findButton(tree, node => (node.props?.['aria-label'] ?? '').startsWith('润色强度'))
  const chip = findChip(makeTree('草稿'))
  check('a strength chip is rendered', chip !== undefined)
  chip.props.onClick()                     // medium -> strong
  check('a chosen strength is remembered', store.get('prompt-polisher.strength') === 'strong', String(store.get('prompt-polisher.strength')))
  const sparkle = sparkleButton(makeTree('草稿'))
  await sparkle.props.onClick()
  check('the chosen strength is sent as a flag', remoteCalls[0]?.[1] === '/polish --strong 草稿', JSON.stringify(remoteCalls[0]?.[1]))
}

// 8f. a typed /polish fills an empty draft through the local completion event
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  const makeTree = (draft) => {
    cursor = 0
    return Control({
      useInput: selector => selector({ draft, phase: 'plain', occurrences: [] }),
      inputActions: { setDraft: value => setDraftCalls.push(value) },
      sessionId: 'session-typed', locked: false,
    })
  }
  makeTree('')                                   // registers this session's writer
  check('the completion listener is installed', typeof handlers['command/executed'] === 'function')
  handlers['command/executed']('session-typed', 'polish', { kind: 'success', text: '键盘改写结果' })
  check('a typed result fills an empty draft', setDraftCalls[0] === '键盘改写结果', JSON.stringify(setDraftCalls))

  setDraftCalls.length = 0
  makeTree('我自己正在写')
  handlers['command/executed']('session-typed', 'polish', { kind: 'success', text: '不该覆盖' })
  check('typing during the command is never overwritten', setDraftCalls.length === 0, JSON.stringify(setDraftCalls))

  setDraftCalls.length = 0
  handlers['command/executed']('session-typed', 'plan', { kind: 'success', text: '别的命令' })
  check('other commands are ignored', setDraftCalls.length === 0)

  setDraftCalls.length = 0
  handlers['command/executed']('session-other', 'polish', { kind: 'success', text: '别的会话' })
  check('other sessions are ignored', setDraftCalls.length === 0)
}

// 8g. a selection polishes only its span, through the editor's own undoable edit
{
  slots = []; store.clear(); setDraftCalls.length = 0; remoteCalls.length = 0
  const inserts = []
  const span = { start: 4, end: 7, draftRev: 1 }
  const actions = {
    setDraft: value => setDraftCalls.push(value),
    captureInsertion: () => span,
    insertText: (text, used) => { inserts.push([text, used]); return true },
  }
  const { tree } = render({ draft: 'aaa bbb', actions })
  await sparkleButton(tree).props.onClick()
  check('a selection sends only the selected text', remoteCalls[0]?.[1] === '/polish --medium bbb', JSON.stringify(remoteCalls[0]?.[1]))
  check('a selection replaces its span instead of the draft', inserts.length === 1 && inserts[0][1] === span && setDraftCalls.length === 0, JSON.stringify(inserts))
}

// 8h. a second click cancels the in-flight rewrite
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  executeImpl = ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  const { tree } = render()
  const first = sparkleButton(tree).props.onClick()
  const second = sparkleButton(render().tree).props.onClick()
  await Promise.all([first, second])
  cursor = 0
  const after = collectText(Control({
    useInput: selector => selector({ draft: '把这段改得更有说服力', phase: 'plain', occurrences: [] }),
    inputActions: { setDraft: () => {} },
    sessionId: 'session-x', locked: false,
  })).join(' ')
  check('a second click cancels the request', after.includes('已取消'), after)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 8i. a typed command failure is surfaced on the control
{
  slots = []; setDraftCalls.length = 0
  const makeTree = (draft) => {
    cursor = 0
    return Control({
      useInput: selector => selector({ draft, phase: 'plain', occurrences: [] }),
      inputActions: { setDraft: value => setDraftCalls.push(value) },
      sessionId: 'session-fail', locked: false,
    })
  }
  makeTree('')
  handlers['command/executed']('session-fail', 'polish', { kind: 'error', text: '润色失败：RATE_LIMIT' })
  cursor = 0
  const after = collectText(makeTree('')).join(' ')
  check('a typed failure becomes visible', after.includes('RATE_LIMIT'), after)

  makeTree('我已经在打字了')
  handlers['command/executed']('session-fail', 'polish', { kind: 'success', text: '结果' })
  check('a blocked typed fill says so', collectText(makeTree('我已经在打字了')).join(' ').includes('草稿已改动，未填入'))
}

// 8j. the Plugins-page card
{
  slots = []; store.clear()
  const card = registrations.find(r => r.options?.name === 'plugins.bundle.config')
  check('a settings card is registered for this bundle', card !== undefined && card.options.key === 'dsh-prompt-hone', JSON.stringify(card?.options))
  const Card = card.component
  const renderCard = (view) => {
    cursor = 0
    return Card({ view })
  }
  const tree = renderCard('page')
  const text = collectText(tree).join(' ')
  check('the card explains the Host-only knobs', text.includes('cordis.patch.yml') && text.includes('provider'), text.slice(0, 120))
  check('the summary view renders nothing', renderCard('summary') === null)
  const strengthButton = findButton(tree, node => (collectText(node).join('')).startsWith('重'))
  if (strengthButton !== undefined) strengthButton.props.onClick()
  check('choosing a strength in the card persists it', store.get('prompt-polisher.strength') === 'strong', String(store.get('prompt-polisher.strength')))
  const input = (function findInput(node) {
    if (node === null || typeof node !== 'object') return undefined
    if (Array.isArray(node)) { for (const child of node) { const hit = findInput(child); if (hit) return hit } return undefined }
    if (node.type === 'input') return node
    for (const child of node.children ?? []) { const hit = findInput(child); if (hit) return hit }
    return undefined
  })(tree)
  input.props.onChange({ target: { value: '90' } })
  check('the card persists the client timeout', store.get('prompt-polisher.timeoutMs') === '90000', String(store.get('prompt-polisher.timeoutMs')))
}

// 8k. token usage from the last call reaches the tooltip
{
  slots = []; setDraftCalls.length = 0; remoteCalls.length = 0
  executeImpl = async ({ line }) => (String(line).includes('--stats')
    ? { ok: true, value: { result: { kind: 'success', text: JSON.stringify({ usage: { inputTokens: 820, outputTokens: 460 } }) } } }
    : { ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
  const { tree } = render()
  await sparkleButton(tree).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  const after = collectText(render().tree).join(' ')
  check('the last token usage is shown', after.includes('入 820') && after.includes('出 460'), after.slice(0, 200))
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 8l. A1: the copied snippet must not teach this machine's route
{
  slots = []; store.clear()
  const card = registrations.find(r => r.options?.name === 'plugins.bundle.config')
  cursor = 0
  const text = collectText(card.component({ view: 'page' })).join(' ')
  check('the snippet carries placeholders, not a real route', !text.includes('deepseek-account') && text.includes('<你的 provider'), text.slice(0, 200))
}

// 8m. A2: a strength chosen in the card reaches the composer chip
{
  slots = []; store.clear()
  const { tree } = render()
  const chipBefore = findButton(tree, node => (node.props?.['aria-label'] ?? '').startsWith('润色强度'))
  check('the chip starts at medium', collectText(chipBefore).join('').startsWith('中'), `label=${JSON.stringify(collectText(chipBefore).join(''))} aria=${chipBefore.props?.['aria-label']}`)
  window.dispatchEvent(new CustomEvent('prompt-polisher:strength', { detail: 'strong' }))
  const chipAfter = findButton(render().tree, node => (node.props?.['aria-label'] ?? '').startsWith('润色强度'))
  check('the chip follows the broadcast', collectText(chipAfter).join('').startsWith('重'), `label=${JSON.stringify(collectText(chipAfter).join(''))} aria=${chipAfter.props?.['aria-label']}`)
}

// 8n. A3: unmounting aborts the in-flight request
{
  slots = []; remoteCalls.length = 0; effectCleanups.length = 0
  executeImpl = ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  const { tree } = render()
  void sparkleButton(tree).props.onClick()
  const signal = remoteCalls.at(-1)?.[3]
  check('the request starts with a signal', signal !== undefined && signal.aborted === false)
  for (const cleanup of effectCleanups) cleanup()
  check('unmounting aborts the request', signal.aborted === true)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 8o. A4: a huge thrown message is truncated, not pasted whole
{
  slots = []; effectCleanups.length = 0
  executeImpl = async () => { throw new Error('x'.repeat(500)) }
  const { tree } = render()
  void sparkleButton(tree).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  const shown = statusText(render().tree)
  check('one thrown value cannot flood the control', shown.length > 0 && shown.length <= 260 && shown.includes('…'), `${shown.length} chars: ${shown.slice(0, 80)}`)
  executeImpl = async () => ({ ok: true, value: { result: { kind: 'success', text: '改写结果' } } })
}

// 9. disabled states
{
  slots = []
  const { tree } = render({ draft: '   ' })
  check('blank draft disables the control', sparkleButton(tree).props.disabled === true)
  const lockedTree = render({ draft: '有内容', locked: true }).tree
  check('locked composer disables the control', sparkleButton(lockedTree).props.disabled === true)
  const busyTree = render({ draft: '有内容', phase: 'sending' }).tree
  check('non-idle phase disables the control', sparkleButton(busyTree).props.disabled === true)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
