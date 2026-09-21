import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconCheck, IconCopy } from './Icons'

function useCopy(text) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }
  return [copied, copy]
}

function CodeBlock({ children }) {
  const code = children?.props
  const lang = /language-([\w-]+)/.exec(code?.className || '')?.[1]
  const text = String(code?.children ?? '').replace(/\n$/, '')
  const [copied, copy] = useCopy(text)
  return (
    <div className="code">
      <div className="code-bar">
        <span>{lang || 'code'}</span>
        <button type="button" className="ghost-btn" onClick={copy}>
          {copied ? <IconCheck width="15" height="15" /> : <IconCopy width="15" height="15" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

const mdComponents = {
  pre: CodeBlock,
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

function Message({ message, streaming, onRetry }) {
  const [copied, copy] = useCopy(message.content)

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="bubble">{message.content}</div>
      </div>
    )
  }

  const waiting = streaming && !message.content
  return (
    <div className="msg msg-bot" data-provider={message.provider}>
      <div className="who">
        <span className="who-dot" />
        {message.model}
      </div>

      {waiting && (
        <div className="typing" role="status" aria-label="Generating a reply">
          <i />
          <i />
          <i />
        </div>
      )}

      {message.content && (
        <div className={`md${streaming ? ' md-live' : ''}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {message.error && (
        <div className="msg-error" role="alert">
          <p>{message.error}</p>
          {onRetry && (
            <button type="button" className="chip" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {message.content && !streaming && (
        <div className="msg-tools">
          <button type="button" className="ghost-btn" onClick={copy}>
            {copied ? <IconCheck width="15" height="15" /> : <IconCopy width="15" height="15" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}

export default memo(Message)
