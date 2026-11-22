import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  CalendarDays, Copy, ExternalLink, Link2, Maximize2, Minimize2, Pencil, Pin, Trash2, X,
} from 'lucide-react'
import { useStore } from '../store'
import { favicon, humanDate, TYPE_EMOJI } from '../utils'
import { CodeBlock, PreBlock } from './CodeBlock'

export default function ItemDrawer({ item, onClose, onEdit }) {
  const { togglePinned, updateItem, removeItem, showToast, theme } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [isMarkdown, setIsMarkdown] = useState(Boolean(item.is_md))
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fav = favicon(item.url)
  const sectionName = item.sectionName || ''

  const copy = () => {
    if (item.url) {
      navigator.clipboard.writeText(item.url).then(() => showToast('Link copied'))
    }
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2500)
      return
    }
    removeItem(item.id)
    showToast(`Deleted “${item.title}”`)
    onClose()
  }

  const toggleMd = async () => {
    const next = !isMarkdown
    setIsMarkdown(next)
    await updateItem(item.id, { is_md: next })
    showToast(next ? 'Markdown rendering on' : 'Markdown rendering off')
  }

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className={`drawer ${fullscreen ? 'fullscreen' : ''}`}>
        <div className="drawer-head">
          <div className="drawer-icon">
            {item.icon ? item.icon : fav ? <img src={fav} alt="" /> : TYPE_EMOJI[item.type]}
          </div>
          <div className="drawer-title">{item.title}</div>
          <button
            className="icon-btn"
            title={fullscreen ? 'Restore (narrow)' : 'Expand to full screen'}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawer-meta">
          {item.type === 'link' && item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="drawer-link">
              <ExternalLink size={13} /> {item.url}
            </a>
          )}
          {item.type === 'todo' && item.due_date && (
            <span className="drawer-chip"><CalendarDays size={13} /> Due {humanDate(item.due_date)}</span>
          )}
          {item.pinned && <span className="drawer-chip amber"><Pin size={13} /> Pinned</span>}
          {sectionName && <span className="drawer-chip">{TYPE_EMOJI[item.type]} {sectionName}</span>}
          <span className="drawer-chip">{item.type}</span>
        </div>

        {item.body && isMarkdown && (
          <div className="drawer-body markdown">
            <div className="md-toolbar">
              <span className="muted">Rendered from markdown</span>
              <button
                className="btn btn-ghost"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowRaw((r) => !r)}
              >
                {showRaw ? 'Rendered view' : 'Source'}
              </button>
            </div>
            {showRaw ? (
              <pre className="md-raw">{item.body}</pre>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ code: CodeBlock, pre: (props) => <PreBlock {...props} theme={theme} /> }}
              >
                {item.body}
              </ReactMarkdown>
            )}
          </div>
        )}

        {item.body && !isMarkdown && (
          <div className={`drawer-body ${item.type === 'snippet' ? 'drawer-snippet' : ''}`}>
            {item.type === 'snippet' ? <pre>{item.body}</pre> : item.body}
          </div>
        )}

        {item.tags?.length > 0 && (
          <div className="tags">
            {item.tags.map((t) => (
              <span key={t} className="tag">#{t}</span>
            ))}
          </div>
        )}

        <div className="drawer-foot">
          {item.type === 'snippet' && item.body && (
            <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(item.body).then(() => showToast('Copied to clipboard 📋'))}>
              <Copy size={14} /> Copy text
            </button>
          )}
          {item.url && (
            <button className="btn" onClick={copy}><Link2 size={14} /> Copy link</button>
          )}
          {item.body && (
            <button className={`btn ${isMarkdown ? 'btn-primary' : ''}`} onClick={toggleMd}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>M↓</span> Markdown
            </button>
          )}
          <button className="btn" onClick={() => togglePinned(item.id, !item.pinned)}>
            <Pin size={14} /> {item.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button className="btn" onClick={() => { onEdit(item); onClose() }}>
            <Pencil size={14} /> Edit
          </button>
          <button
            className={`btn ${confirmDelete ? 'btn-primary' : ''}`}
            style={{ color: confirmDelete ? 'var(--on-primary)' : 'var(--red)', marginLeft: 'auto' }}
            onClick={handleDelete}
          >
            <Trash2 size={14} /> {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </aside>
    </div>
  )
}
