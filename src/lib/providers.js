/**
 * Provider registry.
 *
 * Every provider exposes:
 *   listModels(key)  -> live list of chat models straight from the provider's API
 *   pickDefault(models) -> which model to use when nothing is selected
 *   stream({key, model, messages, signal}) -> async generator of text chunks
 *
 * Because the model list is fetched from the provider itself, new models
 * appear (and retired ones disappear) without any code change.
 */

/**
 * Proxy mode (production build): requests go to this site's own /api/* routes and
 * the server adds the API key from its environment. No key ever reaches the browser.
 * Direct mode (npm run dev): the browser calls the providers with a key you paste in.
 */
export const PROXY_MODE = import.meta.env.VITE_USE_PROXY === 'true'
const endpoint = (id, direct) => (PROXY_MODE ? `/api/${id}` : direct)

const SYSTEM_PROMPT =
  'You are a helpful, concise assistant. Reply in the same language and style the user writes in (Hindi, Hinglish or English). Use Markdown for lists and code.'

async function fail(res) {
  let message = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    message = body?.error?.message || message
  } catch {
    /* body was not JSON */
  }
  const err = new Error(message)
  err.status = res.status
  throw err
}

/** Yields the payload of every `data:` line in a Server-Sent Events response. */
async function* sseData(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim()
}

/* ------------------------------------------------------------------ Groq */

const GROQ = endpoint('groq', 'https://api.groq.com/openai/v1')
const groqAuth = (key) => (PROXY_MODE ? {} : { Authorization: `Bearer ${key}` })
const GROQ_SKIP = /whisper|tts|orpheus|guard|safeguard|embed|distil-whisper/i

const groq = {
  id: 'groq',
  label: 'Groq',
  blurb: 'Llama, GPT-OSS and more. Very fast.',
  keyUrl: 'https://console.groq.com/keys',
  fallback: [{ id: 'llama-3.3-70b-versatile', name: 'llama-3.3-70b-versatile' }],

  async listModels(key, signal) {
    const res = await fetch(`${GROQ}/models`, {
      headers: groqAuth(key),
      signal,
    })
    if (!res.ok) await fail(res)
    const { data = [] } = await res.json()
    return data
      .filter((m) => m.active !== false && !GROQ_SKIP.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map((m) => ({
        id: m.id,
        name: m.id,
        note: '',
      }))
  },

  pickDefault(models) {
    const prefer = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4/, /70b/, /versatile/]
    for (const re of prefer) {
      const hit = models.find((m) => re.test(m.id))
      if (hit) return hit.id
    }
    return models[0]?.id
  },

  async *stream({ key, model, messages, signal }) {
    const res = await fetch(`${GROQ}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...groqAuth(key) },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    })
    if (!res.ok) await fail(res)
    for await (const data of sseData(res)) {
      if (data === '[DONE]') return
      try {
        const text = JSON.parse(data)?.choices?.[0]?.delta?.content
        if (text) yield text
      } catch {
        /* partial JSON - skip */
      }
    }
  },
}

/* ---------------------------------------------------------------- Gemini */

const GEMINI = endpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta')
const geminiAuth = (key) => (PROXY_MODE ? {} : { 'x-goog-api-key': key })
const GEMINI_SKIP =
  /embedding|aqa|imagen|veo|tts|image|audio|live|robotics|computer-use|deep-research|learnlm|gemma/i

/** Higher rank = shown first. "-latest" aliases always point at the newest model. */
function geminiRank(id) {
  if (/-latest$/.test(id)) return 1000
  const version = parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0)
  const stable = /preview|exp|thinking/.test(id) ? 0 : 1
  const tier = /lite/.test(id) ? 1 : /flash/.test(id) ? 3 : /pro/.test(id) ? 2 : 0
  return version * 100 + stable * 10 + tier
}

const gemini = {
  id: 'gemini',
  label: 'Gemini',
  blurb: 'Google Gemini. Generous free tier.',
  keyUrl: 'https://aistudio.google.com/apikey',
  fallback: [{ id: 'gemini-flash-latest', name: 'Gemini Flash (always newest)' }],

  async listModels(key, signal) {
    const models = []
    let pageToken = ''
    do {
      const url = `${GEMINI}/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`
      const res = await fetch(url, { headers: geminiAuth(key), signal })
      if (!res.ok) await fail(res)
      const body = await res.json()
      models.push(...(body.models || []))
      pageToken = body.nextPageToken || ''
    } while (pageToken)

    return models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName }))
      .filter((m) => !GEMINI_SKIP.test(m.id))
      .sort((a, b) => geminiRank(b.id) - geminiRank(a.id))
      .map((m) => ({
        ...m,
        note: /-latest$/.test(m.id) ? 'always newest' : '',
      }))
  },

  pickDefault(models) {
    return (
      models.find((m) => m.id === 'gemini-flash-latest') ||
      models.find((m) => /flash/.test(m.id) && !/lite|preview|exp/.test(m.id)) ||
      models[0]
    )?.id
  },

  async *stream({ key, model, messages, signal }) {
    const res = await fetch(`${GEMINI}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...geminiAuth(key) },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    })
    if (!res.ok) await fail(res)

    let produced = false
    let blocked = ''
    for await (const data of sseData(res)) {
      try {
        const json = JSON.parse(data)
        blocked = json.promptFeedback?.blockReason || blocked
        const parts = json.candidates?.[0]?.content?.parts || []
        for (const part of parts) {
          if (part.text) {
            produced = true
            yield part.text
          }
        }
      } catch {
        /* partial JSON - skip */
      }
    }
    if (!produced && blocked) throw new Error(`Gemini blocked this prompt (${blocked}).`)
  },
}

export const PROVIDERS = { groq, gemini }
export const PROVIDER_IDS = Object.keys(PROVIDERS)
