// Vercel serverless entry. Files starting with "_" are not exposed as routes.
import { forward, sendJson } from '../../server/proxy-core.js'

const hits = new Map() // best-effort, per warm function instance
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 30

export function makeHandler(name) {
  const prefix = new RegExp(`^/api/${name}`)
  return async function handler(req, res) {
    const ip =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    const now = Date.now()
    let hit = hits.get(ip)
    if (!hit || hit.reset < now) {
      hit = { count: 0, reset: now + 60_000 }
      hits.set(ip, hit)
    }
    if (++hit.count > LIMIT) {
      return sendJson(res, 429, { error: { message: 'Too many requests. Wait a minute and try again.' } })
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)

    await forward({
      name,
      rawUrl: (req.url || '').replace(prefix, ''),
      method: req.method,
      body: req.body,
      res,
    })
  }
}
