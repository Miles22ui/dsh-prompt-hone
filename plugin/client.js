/**
 * Client half of the prompt polisher: a sparkle control in the composer tool
 * row that rewrites the current draft in place.
 *
 * The rewrite stays on the Host: this module sends the draft as a `/polish`
 * command line and reads the returned text out of the RemoteResult envelope
 * (`{ ok, value }` → `value.result`), which the transcript never renders. The
 * draft is replaced only when it is still the exact text that was sent, so an
 * edit made while the model works is never lost.
 *
 * Plain script on purpose: the Web module loader evaluates this factory with no
 * build step, so React comes from the module table and nothing else is imported.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-hone',
  factory(require) {
    const React = require('react')
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    // 0.10 kept a style choice and a rewrite history in localStorage; both are
    // gone, and the history held draft text, so clear the leftovers once.
    try {
      window.localStorage.removeItem('prompt-hone.history')
      window.localStorage.removeItem('prompt-hone.style')
    } catch (_error) {
      // Private mode or an older runtime without removeItem: nothing to clear.
    }

    /** The only composer phase in which a programmatic draft write is accepted. */
    const IDLE = 'plain'

    /** Strength ids; the visible label comes from the active language. */
    const STRENGTHS = [
      { id: 'light', flag: '--light' },
      { id: 'medium', flag: '--medium' },
      { id: 'strong', flag: '--strong' },
    ]

    /** UI languages: `auto` follows the browser, the others pin one. */
    const LOCALES = ['auto', 'zh', 'en']
    const LOCALE_KEY = 'prompt-hone.locale'

    /** Same-document signal so the composer control and the card stay in sync. */
    const LOCALE_EVENT = 'prompt-hone:locale'

    function readLocalePref() {
      try {
        const stored = window.localStorage.getItem(LOCALE_KEY)
        return LOCALES.includes(stored) ? stored : 'auto'
      } catch (_error) {
        return 'auto'
      }
    }

    function writeLocalePref(value) {
      try { window.localStorage.setItem(LOCALE_KEY, value) } catch (_error) { /* private mode */ }
    }

    /**
     * Resolve the language actually used for text.
     * @param pref - `auto`, `zh` or `en`.
     * @returns `zh` or `en`.
     */
    function resolveLocale(pref) {
      if (pref === 'zh' || pref === 'en') return pref
      try {
        const language = window.navigator?.language ?? 'en'
        return /^zh/i.test(language) ? 'zh' : 'en'
      } catch (_error) {
        return 'zh'
      }
    }

    function broadcastLocale(value) {
      try { window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: value })) } catch (_error) { /* no CustomEvent */ }
    }

    /** Every visible string, once per language. */
    const MESSAGES = {
      zh: {
        polish: '润色提示词', polishTitle: '润色提示词（有选区只润选区，否则润整段）',
        cancel: '取消润色', undo: '撤销', undoTitle: '撤销润色，恢复原文',
        strengthTitle: '润色强度：轻改 / 标准 / 重构 — 点击切换', strengthAria: '润色强度',
        references: '草稿含引用，未替换', changed: '草稿已改动，未覆盖', changedNoFill: '草稿已改动，未填入',
        cancelled: '已取消', timeout: '超时未返回（{seconds} 秒），已取消',
        channel: '通道不可用 {detail}', unregistered: '命令未注册或返回为空：确认插件已启用并已重启',
        rejected: '命令被拒绝：{code} {message}', empty: '没有返回内容',
        stepFailed: '{step} 失败：{message}', polishFailed: '润色失败',
        lastUsage: '上次：入 {input} / 出 {output} tokens',
        preferences: '本机偏好（存在浏览器里，换设备不跟随）',
        language: '语言', defaultStrength: '默认强度', clientTimeout: '客户端超时（秒）',
        timeoutHint: '5–600，超时即取消并提示', hostOnly: '以下只在 Host 侧生效，改 profile 的 cordis.patch.yml：',
        copySnippet: '复制配置片段', saved: '已保存', copied: '已复制配置片段', copyFailed: '复制失败，请手动选中',
        langAuto: '自动', langZh: '中文', langEn: 'English',
        failureGeneric: '润色失败',
        strength: { light: '轻', medium: '中', strong: '重' },
        failure: {
          NO_MODEL: '没有可用的模型：先在输入框的模型选择器里选一个，或在插件配置里设置 provider 与 model',
          FAILED: '润色失败',
          PROVIDER_FAILED: '模型服务报错',
          CANCELLED: '润色已取消',
          TIMEOUT: '润色超时，请重试',
          EMPTY: '模型没有返回内容，请重试',
          TOO_LONG: '草稿过长，请分段润色',
          USAGE: '用法：/polish [--light|--medium|--strong] <草稿>',
        },
      },
      en: {
        polish: 'Polish prompt', polishTitle: 'Polish the prompt (selection only, when text is selected)',
        cancel: 'Cancel polishing', undo: 'Undo', undoTitle: 'Undo the rewrite and restore the original',
        strengthTitle: 'Strength: light / medium / strong — click to switch', strengthAria: 'Polish strength',
        references: 'The draft has references, so it was left untouched', changed: 'The draft changed, nothing was overwritten',
        changedNoFill: 'The draft changed, so the result was not filled in',
        cancelled: 'Cancelled', timeout: 'Timed out after {seconds}s, cancelled',
        channel: 'Command channel unavailable: {detail}', unregistered: 'Command not registered or empty reply — check that the plugin is enabled and DSH was restarted',
        rejected: 'Command rejected: {code} {message}', empty: 'Empty reply',
        stepFailed: '{step} failed: {message}', polishFailed: 'Polishing failed',
        lastUsage: 'Last: in {input} / out {output} tokens',
        preferences: 'Local preferences (stored in this browser)',
        language: 'Language', defaultStrength: 'Default strength', clientTimeout: 'Client timeout (s)',
        timeoutHint: '5–600; on timeout the request is cancelled', hostOnly: 'Host-side only — edit cordis.patch.yml in the profile:',
        copySnippet: 'Copy snippet', saved: 'Saved', copied: 'Snippet copied', copyFailed: 'Copy failed, select it manually',
        langAuto: 'Auto', langZh: '中文', langEn: 'English',
        failureGeneric: 'Polishing failed',
        strength: { light: 'Light', medium: 'Medium', strong: 'Strong' },
        failure: {
          NO_MODEL: 'No model available — pick one in the composer, or set provider and model in the plugin config',
          FAILED: 'Polishing failed',
          PROVIDER_FAILED: 'The model provider returned an error',
          CANCELLED: 'Polishing cancelled',
          TIMEOUT: 'Polishing timed out, please retry',
          EMPTY: 'The model returned nothing, please retry',
          TOO_LONG: 'The draft is too long — polish it in parts',
          USAGE: 'Usage: /polish [--light|--medium|--strong] <draft>',
        },
      },
    }

    /**
     * Look up one message.
     * @param locale - `zh` or `en`.
     * @param key - message key.
     * @param vars - optional `{name}` replacements.
     * @returns the localized text.
     */
    function t(locale, key, vars) {
      const table = MESSAGES[locale] ?? MESSAGES.en
      let text = table[key] ?? MESSAGES.en[key] ?? key
      if (vars !== undefined) {
        for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
      }
      return text
    }

    /** Host failures carry a bracketed code so the reader's language can win. */
    const FAILURE_PREFIX = /^\[([A-Z][A-Z0-9_]*)\]\s*/

    /** Uppercase token inside a failure body, such as RATE_LIMIT. */
    const FAILURE_DETAIL = /\b([A-Z][A-Z0-9_]{2,})\b/

    /**
     * Translate one Host failure string.
     *
     * The Host always returns readable Chinese with a `[CODE]` prefix. A known
     * code becomes the reader's language; an unknown one keeps the original
     * text (minus the prefix) so a newer Host never degrades to a raw code.
     * @param locale - `zh` or `en`.
     * @param text - the command result text.
     * @returns the text to show.
     */
    function translateFailure(locale, text) {
      if (typeof text !== 'string') return text
      const match = FAILURE_PREFIX.exec(text)
      if (match === null) return text
      const code = match[1]
      const body = text.slice(match[0].length)
      const table = MESSAGES[locale] ?? MESSAGES.en
      const message = table.failure?.[code]
      if (message === undefined) return body
      const detail = code === 'FAILED' || code === 'PROVIDER_FAILED' ? FAILURE_DETAIL.exec(body) : null
      return detail === null ? message : `${message} (${detail[1]})`
    }

    /**
     * Visible name of one strength.
     * @param locale - `zh` or `en`.
     * @param id - strength id.
     * @returns the label.
     */
    function strengthLabel(locale, id) {
      return (MESSAGES[locale] ?? MESSAGES.en).strength[id] ?? id
    }

    /** Remembered strength, so a reload keeps the reader's choice. */
    const STRENGTH_KEY = 'prompt-polisher.strength'

    /** Same-document signal; a `storage` event never fires for the writing tab. */
    const STRENGTH_EVENT = 'prompt-polisher:strength'

    /**
     * Broadcast one chosen strength to every mounted surface.
     * @param id - strength id.
     */
    function broadcastStrength(id) {
      try { window.dispatchEvent(new CustomEvent(STRENGTH_EVENT, { detail: id })) } catch (_error) { /* no CustomEvent */ }
    }

    function readStrength() {
      try {
        const stored = window.localStorage.getItem(STRENGTH_KEY)
        return STRENGTHS.some(entry => entry.id === stored) ? stored : 'medium'
      } catch (_error) {
        return 'medium'
      }
    }

    function writeStrength(id) {
      try { window.localStorage.setItem(STRENGTH_KEY, id) } catch (_error) { /* private mode */ }
    }

    /** A rewrite that never returns must not spin the control forever. */
    const TIMEOUT_KEY = 'prompt-polisher.timeoutMs'
    const DEFAULT_TIMEOUT_MS = 60000

    function readTimeoutMs() {
      try {
        const value = Number(window.localStorage.getItem(TIMEOUT_KEY))
        return Number.isFinite(value) && value >= 5000 && value <= 600000 ? value : DEFAULT_TIMEOUT_MS
      } catch (_error) {
        return DEFAULT_TIMEOUT_MS
      }
    }

    function writeTimeoutMs(ms) {
      try { window.localStorage.setItem(TIMEOUT_KEY, String(ms)) } catch (_error) { /* private mode */ }
    }

    /**
     * Combine the cancel signal with a hard timeout.
     * @param signal - the control's own cancellation signal.
     * @param timeoutMs - deadline for the whole request.
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

    function sparkle(size) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true,
        fill: 'currentColor', style: { display: 'block' },
      }, h('path', {
        d: 'M8 1.2l1.35 3.3 3.3 1.35-3.3 1.35L8 10.5 6.65 7.2 3.35 5.85l3.3-1.35z',
      }), h('path', {
        d: 'M12.6 10.1l.72 1.76 1.76.72-1.76.72-.72 1.76-.72-1.76L10.12 12.6l1.76-.72z',
        opacity: 0.75,
      }))
    }

    /**
     * Normalize whatever the Remote returns into the command outcome.
     *
     * The Host Remote answers with a `RemoteResult` envelope
     * (`{ ok: true, value: { commandId, result } }`), but a differently
     * wrapped call must not surface as an opaque TypeError, so raw
     * `CommandResult` and `{ result }` shapes are accepted too.
     * @param outcome - value returned by `remote.commands.execute`.
     * @returns the command result, a refusal, or a missing-call marker.
     */
    function unwrap(outcome) {
      if (outcome === undefined || outcome === null) return { kind: 'missing' }
      if (typeof outcome.ok === 'boolean') {
        if (outcome.ok === false) return { kind: 'refused', error: outcome.error }
        if (outcome.value === undefined || outcome.value === null) return { kind: 'missing' }
        return { kind: 'result', result: outcome.value.result ?? outcome.value }
      }
      if (outcome.kind === 'success' || outcome.kind === 'error') return { kind: 'result', result: outcome }
      if (typeof outcome.result === 'object' && outcome.result !== null) return { kind: 'result', result: outcome.result }
      return { kind: 'result', result: outcome }
    }

    /**
     * Read the Remote client without ever throwing.
     *
     * Cordis resolves a service property through a tracker that THROWS when the
     * service is not on that context, so `ctx.remote` cannot distinguish
     * "absent" from "broken". Installed third-party plugins reach services with
     * `ctx.get(name)` instead, so that accessor is tried first and the property
     * stays as a fallback; both sit behind their own catch.
     * @param ctx - Client plugin context or an injected scope.
     * @returns the Remote service and a short report of what was tried.
     */
    /**
     * Read one value behind its own catch and record the attempt.
     *
     * Cordis resolves a service property through a tracker that THROWS when the
     * service is not on that context, so neither property access nor a nested
     * namespace can be probed without a catch.
     * @param tried - report lines, appended to.
     * @param label - short accessor name for the report.
     * @param fn - accessor.
     * @returns the value, or undefined when absent or throwing.
     */
    function readValue(tried, label, fn) {
      try {
        const value = fn()
        tried.push(`${label}:${value === undefined ? 'absent' : 'ok'}`)
        return value
      } catch (reason) {
        tried.push(`${label}:${describe(reason)}`)
        return undefined
      }
    }

    /**
     * Find the commands namespace.
     *
     * Namespaces are separate service keys in Cordis — the shipped speech
     * plugin injects `remote.speech` — so `remote.commands` is tried as its own
     * service before falling back to a property on the base client.
     * @param holder - namespace captured from `ctx.inject`.
     * @param ctx - Client plugin context.
     * @returns the commands face and a short report of what was tried.
     */
    function commandsOf(holder, ctx) {
      const tried = []
      const usable = value => (typeof value?.execute === 'function' ? value : undefined)
      const fromInject = usable(readValue(tried, 'inject', () => holder.commands))
      if (fromInject !== undefined) return { commands: fromInject, tried: tried.join(' ') }
      const byKey = usable(readValue(tried, "get('remote.commands')", () => (
        typeof ctx.get === 'function' ? ctx.get('remote.commands') : undefined)))
      if (byKey !== undefined) return { commands: byKey, tried: tried.join(' ') }
      const base = readValue(tried, "get('remote')", () => (
        typeof ctx.get === 'function' ? ctx.get('remote') : undefined))
        ?? readValue(tried, 'ctx.remote', () => ctx.remote)
      const nested = base === undefined ? undefined : usable(readValue(tried, 'base.commands', () => base.commands))
      if (nested !== undefined) return { commands: nested, tried: tried.join(' ') }
      const direct = usable(readValue(tried, 'ctx.remote.commands', () => ctx.remote.commands))
      return { commands: direct, tried: tried.join(' ') }
    }

    /** Longest diagnostic kept from one thrown value. */
    const MAX_DETAIL = 200

    /**
     * One short line for an unknown thrown value.
     *
     * Errors thrown inside a `data:`-URL module carry the whole module source
     * in their stack, so an untruncated message floods the console and the
     * control's tooltip.
     * @param reason - thrown value.
     * @returns a single-line description, at most MAX_DETAIL characters.
     */
    function describe(reason) {
      let text
      if (reason instanceof Error) text = reason.message === '' ? reason.name : reason.message
      else if (typeof reason === 'string') text = reason
      else {
        try { text = JSON.stringify(reason) } catch (_error) { text = String(reason) }
      }
      const line = String(text).replace(/\s+/g, ' ').trim()
      return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL)}…` : line
    }

    /**
     * Build the component bound to the plugin context and its injected scope.
     * @param holder - object whose `commands` is filled by `ctx.inject`.
     * @param ctx - Client plugin context (fallback accessor).
     * @param writers - per-Session draft access, so a typed `/polish` can fill
     * the composer the same way the button does.
     * @returns the composer-row React component.
     */
    function createControl(holder, ctx, writers) {
      return function PromptPolishControl(props) {
        const { useInput, inputActions, sessionId, locked } = props
        const draft = useInput(state => state.draft)
        const phase = useInput(state => state.phase)
        const occurrences = useInput(state => state.occurrences)
        const [busy, setBusy] = useState(false)
        const [strength, setStrength] = useState(readStrength)
        const [error, setError] = useState(null)
        const [previous, setPrevious] = useState(null)
        const [detail, setDetail] = useState(null)
        const [usage, setUsage] = useState(null)
        const [localePref, setLocalePref] = useState(readLocalePref)
        const locale = resolveLocale(localePref)
        const liveDraft = useRef(draft)
        liveDraft.current = draft
        const actionsRef = useRef(inputActions)
        actionsRef.current = inputActions
        const abortRef = useRef(null)

        useEffect(() => {
          const onStrength = (event) => {
            const next = event?.detail
            if (STRENGTHS.some(entry => entry.id === next)) setStrength(next)
          }
          try { window.addEventListener(STRENGTH_EVENT, onStrength) } catch (_error) { /* no window */ }
          return () => {
            try { window.removeEventListener(STRENGTH_EVENT, onStrength) } catch (_error) { /* no window */ }
          }
        }, [])

        useEffect(() => {
          const onLocale = (event) => {
            const next = event?.detail
            if (LOCALES.includes(next)) setLocalePref(next)
          }
          try { window.addEventListener(LOCALE_EVENT, onLocale) } catch (_error) { /* no window */ }
          return () => {
            try { window.removeEventListener(LOCALE_EVENT, onLocale) } catch (_error) { /* no window */ }
          }
        }, [])

        // Switching Session unmounts the control; the request must not keep
        // burning tokens for a draft nobody can see.
        useEffect(() => () => {
          const controller = abortRef.current
          abortRef.current = null
          if (controller !== null && controller !== undefined) {
            try { controller.abort() } catch (_error) { /* already settled */ }
          }
        }, [])

        // A typed `/polish` is executed by the composer itself, so its result
        // reaches this plugin only through the local completion event.
        useEffect(() => {
          writers.set(sessionId, {
            read: () => liveDraft.current,
            write: (text) => { actionsRef.current.setDraft(text) },
            fail: (text) => { setError(text) },
          })
          return () => { writers.delete(sessionId) }
        }, [sessionId, writers])

        const usable = !locked && phase === IDLE && !busy
        const hasDraft = typeof draft === 'string' && draft.trim() !== ''
        const canRun = !locked && phase === IDLE && hasDraft

        const current = STRENGTHS.find(entry => entry.id === strength) ?? STRENGTHS[1]
        const hasReferences = Array.isArray(occurrences) && occurrences.length > 0

        const cycleStrength = () => {
          const index = STRENGTHS.findIndex(entry => entry.id === strength)
          const next = STRENGTHS[(index + 1) % STRENGTHS.length]
          setStrength(next.id)
          writeStrength(next.id)
          broadcastStrength(next.id)
        }

        /** Read the last call's token usage; the Host answers `--stats` without calling a model. */
        const refreshUsage = async () => {
          try {
            const resolved = commandsOf(holder, ctx)
            if (resolved.commands === undefined) return
            const outcome = unwrap(await resolved.commands.execute(sessionId, '/polish --stats', []))
            if (outcome.kind !== 'result' || outcome.result?.kind !== 'success') return
            const parsed = JSON.parse(outcome.result.text)
            if (parsed?.usage !== undefined && parsed.usage !== null) setUsage(parsed.usage)
          } catch (_error) {
            // Usage display is optional; a failure must not surface as a polish error.
          }
        }

        const cancel = () => {
          const controller = abortRef.current
          abortRef.current = null
          if (controller !== null && controller !== undefined) {
            try { controller.abort() } catch (_error) { /* already settled */ }
          }
        }

        const run = async () => {
          if (busy) { cancel(); return }
          const sent = liveDraft.current
          if (typeof sent !== 'string' || sent.trim() === '') return
          if (hasReferences) {
            // setDraft() drops inline reference chips; refuse instead of losing them.
            setError(t(locale, 'references'))
            return
          }
          // A selection polishes just that passage; an empty selection polishes
          // the whole draft. Span offsets are clipboard-text coordinates, which
          // only line up with the draft while no reference chips are present.
          let span
          try { span = actionsRef.current.captureInsertion() } catch (_error) { span = undefined }
          const hasSelection = span !== undefined && typeof span.start === 'number'
            && typeof span.end === 'number' && span.end > span.start
          const target = hasSelection ? sent.slice(span.start, span.end) : sent
          if (typeof target !== 'string' || target.trim() === '') return
          const controller = new AbortController()
          abortRef.current = controller
          const timeoutMs = readTimeoutMs()
          const signal = composeSignal(controller.signal, timeoutMs)
          setBusy(true)
          setError(null)
          setDetail(null)
          setPrevious(null)
          let step = 'remote'
          try {
            const resolved = commandsOf(holder, ctx)
            const commands = resolved.commands
            if (commands === undefined) {
              console.error('[prompt-hone] command channel unavailable:', resolved.tried)
              // The row is narrow: show a short line, keep the full report on hover.
              const brief = resolved.tried.length > 44 ? `${resolved.tried.slice(0, 44)}…` : resolved.tried
              setError(t(locale, 'channel', { detail: brief }))
              setDetail(resolved.tried)
              return
            }
            step = 'execute'
            const outcome = unwrap(await commands.execute(sessionId, `/polish ${current.flag} ${target}`, [], signal))
            if (outcome.kind === 'missing') {
              setError(t(locale, 'unregistered'))
              return
            }
            if (outcome.kind === 'refused') {
              const failure = outcome.error
              setError(t(locale, 'rejected', {
                code: failure?.code ?? '?', message: failure?.message ?? describe(failure),
              }))
              return
            }
            step = 'result'
            const result = outcome.result ?? {}
            if (result.kind !== 'success' || typeof result.text !== 'string' || result.text === '') {
              setError(typeof result.text === 'string' && result.text !== ''
                ? translateFailure(locale, result.text)
                : t(locale, 'empty'))
              return
            }
            step = 'apply'
            if (liveDraft.current !== sent) {
              setError(t(locale, 'changed'))
              return
            }
            if (hasSelection) {
              // insertText is one native undo step and carries its own revision check.
              const applied = actionsRef.current.insertText(result.text, span)
              if (!applied) setError(t(locale, 'changed'))
              else setPrevious(null)
            } else {
              setPrevious(sent)
              actionsRef.current.setDraft(result.text)
            }
            void refreshUsage()
          } catch (reason) {
            if (controller.signal.aborted) {
              setError(t(locale, 'cancelled'))
            } else if (signal.aborted) {
              setError(t(locale, 'timeout', { seconds: Math.round(timeoutMs / 1000) }))
            } else {
              console.error('[prompt-hone] failed at', step, reason)
              setError(t(locale, 'stepFailed', { step, message: describe(reason) }))
            }
          } finally {
            abortRef.current = null
            setBusy(false)
          }
        }

        const undo = () => {
          if (previous === null) return
          inputActions.setDraft(previous)
          setPrevious(null)
          setError(null)
        }

        return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
          h('button', {
            type: 'button',
            title: busy
              ? t(locale, 'cancel')
              : [error ?? t(locale, 'polishTitle'),
                usage === null ? null : t(locale, 'lastUsage', {
                  input: usage.inputTokens ?? '?', output: usage.outputTokens ?? '?',
                }),
              ].filter(Boolean).join(' · '),
            'aria-label': busy ? t(locale, 'cancel') : t(locale, 'polish'),
            'aria-busy': busy ? 'true' : 'false',
            disabled: locked || (!busy && !canRun),
            onClick: () => { void run() },
            style: {
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, padding: 0, border: 0, borderRadius: 8,
              background: 'transparent', color: 'inherit',
              cursor: busy || canRun ? 'pointer' : 'default',
              opacity: busy || canRun ? 1 : 0.4,
              flex: '0 0 auto',
            },
          }, busy
            ? h('span', {
              style: {
                width: 13, height: 13, borderRadius: '50%',
                border: '2px solid currentColor', borderTopColor: 'transparent',
                animation: 'dsh-prompt-hone-spin .8s linear infinite',
              },
            })
            : sparkle(15)),
          h('button', {
            type: 'button',
            onClick: cycleStrength,
            title: t(locale, 'strengthTitle'),
            'aria-label': `${t(locale, 'strengthAria')} ${strengthLabel(locale, current.id)}`,
            disabled: !usable,
            style: {
              border: 0, background: 'transparent', color: 'inherit', cursor: usable ? 'pointer' : 'default',
              fontSize: 11, opacity: usable ? 0.65 : 0.35, padding: '0 2px', flex: '0 0 auto',
            },
          }, strengthLabel(locale, current.id)),
          previous === null ? null : h('button', {
            type: 'button',
            onClick: undo,
            title: t(locale, 'undoTitle'),
            style: {
              border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer',
              fontSize: 11, opacity: 0.7, padding: 0, flex: '0 0 auto',
            },
          }, t(locale, 'undo')),
          error === null ? null : h('span', {
            role: 'status',
            title: detail ?? error,
            style: {
              fontSize: 11, opacity: 0.8, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            },
          }, error),
          busy ? h('style', null, '@keyframes dsh-prompt-hone-spin{to{transform:rotate(360deg)}}') : null)
      }
    }


    /**
     * Plugins-page card: the two knobs this plugin can change without touching
     * YAML, plus the exact snippet for the knobs only the Host reads.
     * @returns the card component.
     */
    function createSettingsCard() {
      const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
      const control = {
        fontSize: 12, color: 'inherit', background: 'var(--dsw-alias-bg-layer-2, transparent)',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
      }
      const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }
      const label = { fontSize: 12, opacity: 0.75, minWidth: 96 }

      return function PromptHoneSettings(props) {
        const { view } = props
        const [strength, setStrengthState] = useState(readStrength)
        const [seconds, setSeconds] = useState(() => Math.round(readTimeoutMs() / 1000))
        const [localePref, setLocalePref] = useState(readLocalePref)
        const [note, setNote] = useState(null)
        const locale = resolveLocale(localePref)

        useEffect(() => {
          const onStrength = (event) => {
            const next = event?.detail
            if (STRENGTHS.some(entry => entry.id === next)) setStrengthState(next)
          }
          const onLocale = (event) => {
            const next = event?.detail
            if (LOCALES.includes(next)) setLocalePref(next)
          }
          try {
            window.addEventListener(STRENGTH_EVENT, onStrength)
            window.addEventListener(LOCALE_EVENT, onLocale)
          } catch (_error) { /* no window */ }
          return () => {
            try {
              window.removeEventListener(STRENGTH_EVENT, onStrength)
              window.removeEventListener(LOCALE_EVENT, onLocale)
            } catch (_error) { /* no window */ }
          }
        }, [])
        if (view === 'summary') return null

        const choose = (id) => {
          setStrengthState(id)
          writeStrength(id)
          broadcastStrength(id)
          setNote(t(locale, 'saved'))
        }
        const chooseLocale = (value) => {
          setLocalePref(value)
          writeLocalePref(value)
          broadcastLocale(value)
        }
        const changeSeconds = (event) => {
          const next = Number(event?.target?.value)
          setSeconds(Number.isFinite(next) ? next : '')
          if (Number.isFinite(next) && next >= 5 && next <= 600) {
            writeTimeoutMs(Math.round(next * 1000))
            setNote(t(locale, 'saved'))
          }
        }
        const snippet = `- insert:
    - id: prompt-hone
      name: 'dsh-prompt-hone'
      config:
        strength: medium
        timeoutMs: 120000
        maxInputChars: 6000
        # ${locale === 'zh' ? '可选：固定润色所用的模型，两行必须同时生效' : 'optional: pin the model used for polishing; both lines are required'}
        # provider: <${locale === 'zh' ? '你的 provider' : 'your provider'}>
        # model: <${locale === 'zh' ? '你的 model' : 'your model'}>`
        const copy = () => {
          try {
            void navigator.clipboard.writeText(snippet)
            setNote(t(locale, 'copied'))
          } catch (_error) {
            setNote(t(locale, 'copyFailed'))
          }
        }
        const pick = (active) => ({
          ...control,
          fontWeight: active ? 600 : 400,
          borderColor: active
            ? 'var(--dsw-alias-brand-primary, currentColor)'
            : 'var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        })

        return h('div', { style: { fontSize: 12, lineHeight: 1.6 } },
          h('div', { style: { ...label, minWidth: 0, opacity: 0.9, marginBottom: 8 } },
            t(locale, 'preferences')),
          h('div', { style: row },
            h('span', { style: label }, t(locale, 'language')),
            ...LOCALES.map(value => h('button', {
              type: 'button',
              key: value,
              onClick: () => chooseLocale(value),
              'aria-pressed': value === localePref ? 'true' : 'false',
              style: pick(value === localePref),
            }, t(locale, value === 'auto' ? 'langAuto' : value === 'zh' ? 'langZh' : 'langEn')))),
          h('div', { style: row },
            h('span', { style: label }, t(locale, 'defaultStrength')),
            ...STRENGTHS.map(entry => h('button', {
              type: 'button',
              key: entry.id,
              title: entry.id,
              onClick: () => choose(entry.id),
              'aria-pressed': entry.id === strength ? 'true' : 'false',
              style: pick(entry.id === strength),
            }, strengthLabel(locale, entry.id)))),
          h('div', { style: row },
            h('span', { style: label }, t(locale, 'clientTimeout')),
            h('input', {
              type: 'number', min: 5, max: 600, step: 5, value: seconds,
              onChange: changeSeconds,
              style: { ...control, width: 88, cursor: 'text' },
            }),
            h('span', { style: { opacity: 0.6 } }, t(locale, 'timeoutHint'))),
          note === null ? null : h('div', { role: 'status', style: { opacity: 0.75, marginBottom: 8 } }, note),
          h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))', paddingTop: 10, marginTop: 4 } },
            h('div', { style: { ...label, minWidth: 0, opacity: 0.75, marginBottom: 6 } },
              t(locale, 'hostOnly')),
            h('pre', { style: { ...mono, fontSize: 11, opacity: 0.9, margin: '0 0 8px', padding: 8, overflowX: 'auto', background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))', borderRadius: 8 } }, snippet),
            h('button', { type: 'button', onClick: copy, style: control }, t(locale, 'copySnippet'))))
      }
    }

    return {
      inject: ['slots', 'remote'],
      apply(ctx) {
        // Cordis resolves services through a context tracker, so the supported
        // way to reach one is a scope that declares it. `remote.commands` is
        // tried as its own namespace key first, because namespaces are separate
        // services; the base client stays as the fallback.
        const holder = { commands: undefined }
        const capture = (key) => {
          try {
            ctx.inject([key], (scope) => {
              try {
                holder.commands = typeof scope.get === 'function' ? scope.get(key) : scope[key]
              } catch (reason) {
                console.warn(`[prompt-hone] injected ${key} but could not read it:`, reason)
              }
            })
          } catch (reason) {
            console.warn(`[prompt-hone] could not inject ${key}:`, reason)
          }
        }
        capture('remote.commands')
        // Two entries per Session: the button path and the typed `/polish` path.
        const writers = new Map()
        ctx.on('command/executed', (sessionId, name, result) => {
          if (name !== 'polish') return
          const entry = writers.get(sessionId)
          if (entry === undefined) return
          if (result === null || typeof result !== 'object') return
          const locale = resolveLocale(readLocalePref())
          if (result.kind === 'error') {
            // Command results never render, so the control is the only place a
            // typed failure can become visible.
            const message = typeof result.text === 'string' && result.text !== ''
              ? translateFailure(locale, result.text)
              : t(locale, 'polishFailed')
            try { entry.fail(message) } catch (_error) { /* control unmounted */ }
            return
          }
          if (result.kind !== 'success') return
          if (typeof result.text !== 'string' || result.text === '') return
          let current
          try { current = entry.read() } catch (_error) { current = '' }
          // Never clobber text the reader started typing while the command ran.
          if (typeof current === 'string' && current !== '') {
            try { entry.fail(t(locale, 'changedNoFill')) } catch (_error) { /* control unmounted */ }
            return
          }
          try { entry.write(result.text) } catch (reason) {
            console.warn('[prompt-hone] could not fill the draft after a typed command:', reason)
          }
        })
        const Control = createControl(holder, ctx, writers)
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'prompt-polisher',
          order: 10,
        }, Control))
        // Keying the card by the package name is what makes the Plugins page
        // render a configuration section at all.
        const SettingsCard = createSettingsCard()
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-prompt-hone',
          order: 10,
        }, SettingsCard))
      },
    }
  },
})
