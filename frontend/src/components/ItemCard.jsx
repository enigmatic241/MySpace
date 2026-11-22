import React, { useState } from 'react'
import { Check, Copy, Link2, Maximize2, Pencil, Pin, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { favicon, humanDate, dueState, TYPE_EMOJI } from '../utils'

export default function ItemCard({ item, onEdit, onOpen }) {
  const { toggleDone, togglePinned, removeItem, showToast } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  const fav = favicon(item.url)
  const isTodo = item.type === 'todo'
  const done = Boolean(item.done)
  const isNote = item.type === 'note'
  const isSnippet = item.type === 'snippet'
  const isLongNote = isNote && (item.body || '').length > 110
  const isMd = isNote && Boolean(item.is_md)

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2500)
      return
    }
    removeItem(item.id)
    showToast(`Deleted “${item.title}”`)
  }

  const handleCopy = () => {
    if (item.url) {
      navigator.clipboard.writeText(item.url).then(() => showToast('Link copied'))
    } else {
      showToast('No URL to copy')
    }
  }

  const copySnippet = (e) => {
    e.stopPropagation()
    if (!item.body) return showToast('Nothing to copy')
    navigator.clipboard.writeText(item.body).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      showToast('Copied to clipboard 📋')
    })
  }

  const due = dueState(item.due_date)

  return (
    <div
      className={`card ${isTodo && done ? 'todo-done' : ''} ${item.pinned ? 'pinned' : ''} ${isNote ? 'clickable' : ''}`}
      onClick={() => isNote && onOpen?.(item)}
    >
      <div className="card-top">
        <div className="card-icon" onClick={isSnippet ? copySnippet : undefined} style={isSnippet ? { cursor: 'pointer' } : undefined} title={isSnippet ? 'Copy to clipboard' : undefined}>
          {item.icon ? item.icon : fav ? (
            <img src={fav} alt="" loading="lazy" />
          ) : (
            TYPE_EMOJI[item.type]
          )}
        </div>
        <div
          className="card-title"
          data-full={item.title}
          onMouseEnter={(e) => {
            const text = e.currentTarget.querySelector('.ct-text')
            e.currentTarget.classList.toggle(
              'is-truncated',
              text && text.scrollWidth > text.clientWidth + 1,
            )
          }}
        >
          <span className="ct-text">
            {item.type === 'link' && item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </span>
        </div>
      </div>

      {isSnippet && item.body && (
        <pre className="snippet-box" onClick={copySnippet} title="Click to copy">{item.body}</pre>
      )}

      {!isSnippet && item.body && (
        <div className="card-body clamped">
          {item.body}
        </div>
      )}

      {isNote && (
        <div className="card-tags-row">
          {isMd && <span className="md-badge">MD</span>}
          {isLongNote && (
            <button
              className="note-expand"
              title="Open full note"
              onClick={(e) => {
                e.stopPropagation()
                onOpen?.(item)
              }}
            >
              <Maximize2 size={12} /> {isMd ? 'Open markdown' : 'Open full note'}
            </button>
          )}
        </div>
      )}

      {item.tags?.length > 0 && (
        <div className="tags">
          {item.tags.map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      )}

      <div className="card-foot">
        {isTodo && (
          <>
            <button
              className={`todo-check ${done ? 'done' : ''}`}
              title={done ? 'Mark as not done' : 'Mark as done'}
              onClick={(e) => {
                e.stopPropagation()
                toggleDone(item.id, !done)
              }}
            >
              ✓
            </button>
            {item.due_date ? (
              <span className={`due-chip ${due}`}>{due === 'overdue' ? `Overdue · ` : ''}{humanDate(item.due_date)}</span>
            ) : (
              <span className="muted">No due date</span>
            )}
          </>
        )}

        <div className="spacer" />

        {isSnippet && (
          <button
            className={`icon-btn snippet-copy ${copied ? 'active' : ''}`}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
            onClick={copySnippet}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}

        <button
          className={`icon-btn pin-btn ${item.pinned ? 'active' : ''}`}
          title={item.pinned ? 'Unpin' : 'Pin to top'}
          onClick={(e) => {
            e.stopPropagation()
            togglePinned(item.id, !item.pinned)
          }}
        >
          <Pin size={14} />
        </button>

        {item.url && (
          <button className="icon-btn" title="Copy link" onClick={(e) => { e.stopPropagation(); handleCopy() }}>
            <Link2 size={14} />
          </button>
        )}

        <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(item) }}>
          <Pencil size={14} />
        </button>

        <button
          className={`icon-btn ${confirming ? 'accent' : ''}`}
          title={confirming ? 'Click again to confirm' : 'Delete'}
          onClick={(e) => { e.stopPropagation(); handleDelete() }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

