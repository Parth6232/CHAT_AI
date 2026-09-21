/**
 * Shared proxy logic, used by both the Express server (Render / any Node host)
 * and the Vercel serverless functions in /api.
 *
 * It adds the API key from the server's environment and forwards the request.
 * The key never reaches the browser.
 */
import { Readable } from 'node:stream'

export const PROVIDERS = {
  groq: {
    base: () => process.env.GROQ_BASE || 'https://api.groq.com/openai/v1',
    envName: 'GROQ_API_KEY',
    // Only these endpoints can be reached, so the key cannot be used for anything else.
    allowed: [/^\/models$/, /^\/chat\/completions$/],
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  gemini: {
    base: () => process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta',
    envName: 'GEMINI_API_KEY',
    allowed: [/^\/models$/, /^\/models\/[\w.-]+:(streamGenerateContent|generateContent)$/],
    headers: (key) => ({ 'x-goog-api-key': key }),
  },
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * @param name    'groq' | 'gemini'
 * @param rawUrl  path + query after the provider prefix, e.g. '/models?pageSize=200'
 */
export async function forward({ name, rawUrl, method, body, res }) {
  const cfg = PROVIDERS[name]
  const key = process.env[cfg.envName]
  if (!key) {
    return sendJson(res, 503, { error: { message: `${cfg.envName} is not set on the server.` } })
  }

  const url = new URL(rawUrl || '/', 'http://local')
  if (!cfg.allowed.some((re) => re.test(url.pathname))) {
    return sendJson(res, 404, { error: { message: 'Not found' } })
  }
  url.searchParams.delete('key') // never let the client smuggle in its own key
  url.searchParams.delete('...path') // Vercel catch-all adds this; providers reject it

  const controller = new AbortController()
  res.on('close', () => controller.abort()) // client hit Stop -> stop the upstream call too

  try {
    const upstream = await fetch(cfg.base() + url.pathname + url.search, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...cfg.headers(key) },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? {}),
    })
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (!upstream.body) return res.end()
    Readable.fromWeb(upstream.body)
      .on('error', () => res.end())
      .pipe(res)
  } catch (e) {
    if (e.name === 'AbortError') return
    if (!res.headersSent) sendJson(res, 502, { error: { message: 'Could not reach the AI provider.' } })
  }
}
