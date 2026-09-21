/**
 * Express server for Render (or any Node host).
 * Serves the built React app from ./dist and proxies /api/groq/* and /api/gemini/*.
 */
import express from 'express'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDERS, forward } from './proxy-core.js'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const app = express()
app.set('trust proxy', 1) // Render sits behind a proxy; needed for per-IP rate limits
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.RATE_LIMIT_PER_MIN) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests. Wait a minute and try again.' } },
  }),
)

for (const name of Object.keys(PROVIDERS)) {
  app.use(`/api/${name}`, (req, res) =>
    forward({ name, rawUrl: req.url, method: req.method, body: req.body, res }),
  )
}

app.use(express.static(dist))
app.use((req, res) => res.sendFile(path.join(dist, 'index.html')))

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Chat AI server on :${port}`))
