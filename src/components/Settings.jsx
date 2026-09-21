import { useEffect, useRef, useState } from 'react'
import { PROVIDERS, PROVIDER_IDS } from '../lib/providers'
import { IconClose } from './Icons'

export default function Settings({ stored, fromEnv, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...stored })
  const [visible, setVisible] = useState(false)
  const first = useRef(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    const clean = {}
    for (const id of PROVIDER_IDS) clean[id] = (draft[id] || '').trim()
    onSave(clean)
    onClose()
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="settings-title">API keys</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <p className="sheet-note">
          Keys you enter here are saved in this browser only and are sent only to the provider you pick.
        </p>

        {PROVIDER_IDS.map((id, i) => {
          const p = PROVIDERS[id]
          return (
            <label className="field" key={id} data-provider={id}>
              <span className="field-label">
                <span className="who-dot" />
                {p.label}
                <a href={p.keyUrl} target="_blank" rel="noreferrer noopener">
                  Get a free key
                </a>
              </span>
              <input
                ref={i === 0 ? first : null}
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck="false"
                value={draft[id] || ''}
                onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                placeholder={fromEnv[id] ? 'Using the key from .env' : 'Paste your key'}
              />
            </label>
          )
        })}

        <label className="check">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Show keys
        </label>

        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn">
            Save keys
          </button>
        </div>
      </form>
    </div>
  )
}
