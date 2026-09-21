import { useCallback, useEffect, useRef, useState } from 'react'
import { PROVIDERS, PROVIDER_IDS } from '../lib/providers'
import { load, save } from '../lib/storage'

const TTL = 6 * 60 * 60 * 1000 // re-fetch model lists after 6 hours
const cacheKey = (id) => `chatai.models.${id}`

/**
 * Keeps a live model list per provider. Lists are cached in localStorage,
 * refreshed automatically when stale (on load and whenever the tab regains
 * focus), and can be refreshed by hand.
 */
export function useCatalog(keys) {
  const [catalog, setCatalog] = useState(() =>
    Object.fromEntries(
      PROVIDER_IDS.map((id) => [
        id,
        { ...load(cacheKey(id), { models: [], at: 0 }), status: 'idle', error: '' },
      ]),
    ),
  )
  const inflight = useRef({})
  const keysRef = useRef(keys)
  useEffect(() => {
    keysRef.current = keys
  })

  const refresh = useCallback(async (id, key) => {
    if (!key || inflight.current[id]) return
    inflight.current[id] = true
    setCatalog((c) => ({ ...c, [id]: { ...c[id], status: 'loading', error: '' } }))
    try {
      const models = await PROVIDERS[id].listModels(key)
      const next = { models, at: Date.now() }
      save(cacheKey(id), next)
      setCatalog((c) => ({ ...c, [id]: { ...next, status: 'idle', error: '' } }))
    } catch (e) {
      setCatalog((c) => ({ ...c, [id]: { ...c[id], status: 'error', error: e.message } }))
    } finally {
      inflight.current[id] = false
    }
  }, [])

  useEffect(() => {
    const checkStale = () => {
      for (const id of PROVIDER_IDS) {
        const key = keysRef.current[id]
        const { at } = load(cacheKey(id), { at: 0 })
        if (key && Date.now() - at > TTL) refresh(id, key)
      }
    }
    checkStale()
    const onVisible = () => document.visibilityState === 'visible' && checkStale()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, keys.groq, keys.gemini])

  return { catalog, refresh }
}
