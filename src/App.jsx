import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import Orb from './components/Orb'
import Message from './components/Message'
import Settings from './components/Settings'
import { IconDown, IconKey, IconMoon, IconPlus, IconRefresh, IconSend, IconStop, IconSun } from './components/Icons'
import { PROVIDERS, PROVIDER_IDS, PROXY_MODE } from './lib/providers'
import { useCatalog } from './hooks/useCatalog'
import { load, save } from './lib/storage'

const ENV_KEYS = {
  groq: import.meta.env.VITE_GROQ_API_KEY || '',
  gemini: import.meta.env.VITE_GEMINI_API_KEY || '',
}

const SUGGESTIONS = [
  'Explain async/await with a simple example',
  'Write a polite email asking for leave',
  'Mujhe React seekhne ka roadmap batao',
  'Give me 5 project ideas for my portfolio',
]

const uid = () => Math.random().toString(36).slice(2, 10)

function timeAgo(ms) {
  if (!ms) return 'never'
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`
}

function friendlyError(e, providerId) {
  const name = PROVIDERS[providerId].label
  if (e.status === 429) {
    return `${name} free limit reached. Wait a minute and retry, or switch provider from the top bar.`
  }
  if (e.status === 401 || e.status === 403 || /api key|permission/i.test(e.message)) {
    return PROXY_MODE
      ? `${name} rejected the server's API key. Check the environment variables on your host.`
      : `${name} rejected the API key. Check it in Settings (key icon).`
  }
  if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
    return 'Could not reach the server. Check your internet connection and retry.'
  }
  return e.message
}

const looksLikeRetiredModel = (e) =>
  e.status === 404 || /not found|decommission|deprecat|no longer supported/i.test(e.message)

export default function App() {
  const [theme, setTheme] = useState(() => load('chatai.theme', null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [provider, setProvider] = useState(() => load('chatai.provider', 'groq'))
  const [picked, setPicked] = useState(() => load('chatai.picked', {}))
  const [storedKeys, setStoredKeys] = useState(() => load('chatai.keys', {}))
  const [messages, setMessages] = useState(() => load('chatai.messages', []))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showJump, setShowJump] = useState(false)

  const scroller = useRef(null)
  const stick = useRef(true)
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  // In proxy mode the server holds the keys, so the browser just uses a placeholder.
  const keys = PROXY_MODE
    ? { groq: 'server', gemini: 'server' }
    : {
        groq: storedKeys.groq || ENV_KEYS.groq,
        gemini: storedKeys.gemini || ENV_KEYS.gemini,
      }
  const { catalog, refresh } = useCatalog(keys)

  const current = catalog[provider]
  const models = current.models.length ? current.models : PROVIDERS[provider].fallback
  const model = models.some((m) => m.id === picked[provider])
    ? picked[provider]
    : PROVIDERS[provider].pickDefault(models)
  const hasKey = Boolean(keys[provider])

  /* ---- persistence ---- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    save('chatai.theme', theme)
  }, [theme])
  useEffect(() => save('chatai.provider', provider), [provider])
  useEffect(() => save('chatai.picked', picked), [picked])
  useEffect(() => {
    if (!busy) save('chatai.messages', messages.slice(-60))
  }, [messages, busy])

  /* ---- composer auto-grow ---- */
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  /* ---- keep the newest text in view unless the reader scrolled away ---- */
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scroller.current
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    stick.current = near
    setShowJump(!near)
  }

  const jumpToLatest = () => {
    stick.current = true
    scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }

  /* ---- sending ---- */
  const run = useCallback(
    async (history, botMsg) => {
      const key = keys[botMsg.provider]
      const ctl = new AbortController()
      abortRef.current = ctl
      setBusy(true)
      stick.current = true
      try {
        for await (const chunk of PROVIDERS[botMsg.provider].stream({
          key,
          model: botMsg.model,
          messages: history,
          signal: ctl.signal,
        })) {
          setMessages((all) => all.map((m) => (m.id === botMsg.id ? { ...m, content: m.content + chunk } : m)))
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          setMessages((all) =>
            all.map((m) => (m.id === botMsg.id ? { ...m, error: friendlyError(e, botMsg.provider) } : m)),
          )
          // The model may have been retired: pull a fresh list so the picker heals itself.
          if (looksLikeRetiredModel(e)) refresh(botMsg.provider, key)
        }
      } finally {
        setMessages((all) => all.filter((m) => !(m.id === botMsg.id && !m.content && !m.error)))
        abortRef.current = null
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys.groq, keys.gemini, refresh],
  )

  const send = (text) => {
    const content = text.trim()
    if (!content || busy) return
    if (!hasKey) {
      setSettingsOpen(true)
      return
    }
    const userMsg = { id: uid(), role: 'user', content }
    const botMsg = { id: uid(), role: 'assistant', content: '', provider, model }
    const history = [...messages.filter((m) => m.content && !m.error), userMsg].map(({ role, content }) => ({
      role,
      content,
    }))
    setMessages((all) => [...all, userMsg, botMsg])
    setInput('')
    run(history, botMsg)
  }

  const retry = () => {
    const last = messages[messages.length - 1]
    const prompt = messages[messages.length - 2]
    if (busy || !last?.error || prompt?.role !== 'user') return
    const botMsg = { id: uid(), role: 'assistant', content: '', provider, model }
    const history = [...messages.slice(0, -1).filter((m) => m.content && !m.error)].map(({ role, content }) => ({
      role,
      content,
    }))
    setMessages([...messages.slice(0, -1), botMsg])
    run(history, botMsg)
  }

  const stop = () => abortRef.current?.abort()

  const newChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  const saveKeys = (next) => {
    setStoredKeys(next)
    save('chatai.keys', next)
  }

  const lastIndex = messages.length - 1
  const empty = messages.length === 0

  return (
    <div className="app" data-provider={provider}>
      <header className="topbar">
        <div className="brand">
          <Orb size={28} busy={busy} />
          <span className="brand-name">Chat AI</span>
        </div>

        <div className="controls">
          <div className="switch" role="tablist" aria-label="AI provider" style={{ '--i': PROVIDER_IDS.indexOf(provider) }}>
            <span className="switch-pill" />
            {PROVIDER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={provider === id}
                className="switch-btn"
                onClick={() => setProvider(id)}
              >
                {PROVIDERS[id].label}
              </button>
            ))}
          </div>

          <div className="modelbar">
            <select
              aria-label="Model"
              value={model || ''}
              onChange={(e) => setPicked({ ...picked, [provider]: e.target.value })}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.note ? ` (${m.note})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`icon-btn${current.status === 'loading' ? ' spin' : ''}`}
              onClick={() => refresh(provider, keys[provider])}
              disabled={!hasKey}
              aria-label="Refresh model list"
              title={
                !hasKey
                  ? 'Add an API key to load models'
                  : current.status === 'error'
                    ? `Could not refresh: ${current.error}`
                    : `${current.models.length} models, updated ${timeAgo(current.at)}`
              }
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="icon-btn" onClick={newChat} aria-label="New chat" title="New chat">
            <IconPlus />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          {!PROXY_MODE && (
            <button
              type="button"
              className={`icon-btn${hasKey ? '' : ' attn'}`}
              onClick={() => setSettingsOpen(true)}
              aria-label="API keys"
              title="API keys"
            >
              <IconKey />
            </button>
          )}
        </div>
      </header>

      <main className="scroller" ref={scroller} onScroll={onScroll}>
        {empty ? (
          <section className="hero">
            <div className="hero-orb" style={{ '--d': '0ms' }}>
              <Orb size={148} busy={busy} />
            </div>
            <h1 style={{ '--d': '160ms' }}>What’s on your mind?</h1>
            <p className="hero-sub" style={{ '--d': '260ms' }}>
              {hasKey ? (
                <>
                  Chatting with {PROVIDERS[provider].label}. {PROVIDERS[provider].blurb}
                </>
              ) : (
                <>Add your {PROVIDERS[provider].label} API key to start chatting.</>
              )}
            </p>
            {hasKey ? (
              <div className="chips" style={{ '--d': '360ms' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="chips" style={{ '--d': '360ms' }}>
                <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
                  <IconKey width="18" height="18" /> Add API key
                </button>
              </div>
            )}
          </section>
        ) : (
          <div className="thread">
            {messages.map((m, i) => (
              <Message
                key={m.id}
                message={m}
                streaming={busy && i === lastIndex && m.role === 'assistant'}
                onRetry={i === lastIndex && m.error && !busy ? retry : undefined}
              />
            ))}
          </div>
        )}
      </main>

      {showJump && (
        <button type="button" className="jump" onClick={jumpToLatest} aria-label="Jump to latest message">
          <IconDown />
        </button>
      )}

      <footer className="composer">
        <div className="composer-box">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${PROVIDERS[provider].label}…`}
            aria-label="Message"
          />
          {busy ? (
            <button type="button" className="send" onClick={stop} aria-label="Stop generating">
              <IconStop />
            </button>
          ) : (
            <button type="button" className="send" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send">
              <IconSend />
            </button>
          )}
        </div>
        <p className="composer-hint">Enter to send, Shift+Enter for a new line</p>
      </footer>

      {settingsOpen && (
        <Settings
          stored={storedKeys}
          fromEnv={{ groq: Boolean(ENV_KEYS.groq), gemini: Boolean(ENV_KEYS.gemini) }}
          onSave={saveKeys}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
