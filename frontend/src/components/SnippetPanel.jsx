import React, { useMemo, useRef, useState } from 'react'
import { Check, Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useStore } from '../store'

/**
 * Compact "cheat sheet" for snippet items (commit messages, commands).
 * - Click a row (or press Enter) → copies full text, substituting any
 *   {{placeholders}} after a quick prompt.
 * - Checkbox / ⇧-click → multi-select, then "Copy N" joins them.
 * - Keyboard: ↑↓ between rows, Enter copies, Space toggles selection,
 *   "/" focuses the filter, Esc clears it.
 */

const PLACEHOLDER_RE = /\{\{\s*([\w.-]+)(?:\s*:\s*([^}]*))?\s*\}\}/g

function extractPlaceholders(text) {
  const out = new Map()
  for (const m of (text || '').matchAll(PLACEHOLDER_RE)) {
    if (!out.has(m[1])) out.set(m[1], (m[2] || '').trim())
  }
  return [...out.entries()] // [[name, defaultValue], …]
}

function fillTemplate(text, values) {
  return (text || '').replace(PLACEHOLDER_RE, (_, name, def) => {
    const v = values?.[name]
    return v !== undefined && v !== '' ? v : (def ?? '')
  })
}

/** Preview with {{placeholders}} tinted. */
function Preview({ text }) {
  const parts = []
  let last = 0
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<span key={m.index} className="snippet-tpl">{`{{${m[1]}}}`}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export default function SnippetPanel({ items, onEditItem, onAddItem }) {
  const { removeItem, showToast, recordCopy } = useStore()
  const [copiedId, setCopiedId] = useState(null)
  const [copiedMulti, setCopiedMulti] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [prompt, setPrompt] = useState(null) // { item, fields, values }
  const rowRefs = useRef([])
  const filterRef = useRef(null)
  const anchorRef = useRef(null)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.body || '').toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q))
    )
  }, [items, filter])

  const flash = (id) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
  }

  const doCopy = (text, item, msg) => {
    navigator.clipboard.writeText(text).then(() => {
      if (item) {
        flash(item.id)
        recordCopy({ id: item.id, label: item.title })
      }
      showToast(msg || 'Copied to clipboard 📋')
    })
  }

  // Copy a single row; templates prompt for values first.
  const copyRow = (item) => {
    if (!item.body) return showToast('Nothing to copy')
    const fields = extractPlaceholders(item.body)
    if (fields.length > 0) {
      const values = {}
      for (const [name, def] of fields) values[name] = def
      setPrompt({ item, fields, values })
      return
    }
    doCopy(item.body, item)
  }

  const submitPrompt = (e) => {
    e.preventDefault()
    if (!prompt) return
    const filled = fillTemplate(prompt.item.body, prompt.values)
    doCopy(filled, prompt.item, `Copied “${prompt.item.title}” 📋`)
    setPrompt(null)
  }

  const toggleSelect = (id, index, e) => {
    e?.stopPropagation()
    const next = new Set(selected)
    if (e?.shiftKey && anchorRef.current != null) {
      const [a, b] = [anchorRef.current, index].sort((x, y) => x - y)
      for (let i = a; i <= b; i++) if (filtered[i]) next.add(filtered[i].id)
    } else {
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchorRef.current = index
    }
    setSelected(next)
  }

  const clearSelection = () => {
    setSelected(new Set())
    anchorRef.current = null
  }

  const copySelected = (e) => {
    e?.stopPropagation()
    const chosen = items.filter((i) => selected.has(i.id) && i.body)
    if (chosen.length === 0) return
    // Templates fall back to their defaults (no prompt when copying many).
    const text = chosen.map((i) => fillTemplate(i.body, null)).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMulti(true)
      setTimeout(() => setCopiedMulti(false), 1500)
      chosen.forEach((i) => recordCopy({ id: i.id, label: i.title }))
      showToast(`Copied ${chosen.length} command${chosen.length === 1 ? '' : 's'} 📋`)
      clearSelection()
    })
  }

  const handleDelete = (item, e) => {
    e.stopPropagation()
    if (confirmId !== item.id) {
      setConfirmId(item.id)
      setTimeout(() => setConfirmId((c) => (c === item.id ? null : c)), 2500)
      return
    }
    removeItem(item.id)
    setSelected((s) => {
      const n = new Set(s)
      n.delete(item.id)
      return n
    })
    showToast(`Deleted “${item.title}”`)
  }

  const onRowKey = (e, item, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      rowRefs.current[Math.min(index + 1, filtered.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      rowRefs.current[Math.max(index - 1, 0)]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      copyRow(item)
    } else if (e.key === ' ') {
      e.preventDefault()
      toggleSelect(item.id, index, e)
    }
  }

  const onPanelKey = (e) => {
    const tag = (e.target.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    if (e.key === '/') {
      e.preventDefault()
      filterRef.current?.focus()
    }
  }

  const showFilter = items.length >= 6
  const selCount = selected.size
  const maxCopies = Math.max(0, ...items.map((i) => i.copy_count || 0))

  return (
    <div className="snippet-panel" onKeyDown={onPanelKey}>
      <div className="snippet-panel-head">
        <span className="snippet-panel-title" title="↑↓ navigate · Enter copy · Space / ⇧-click multi-select · / filter">
          ⌨️ Quick copy
        </span>
        {selCount > 0 ? (
          <>
            <span className="sub">{selCount} selected</span>
            <button
              className={`btn btn-primary snippet-copy-sel ${copiedMulti ? 'active' : ''}`}
              onClick={copySelected}
            >
              {copiedMulti ? <Check size={13} /> : <Copy size={13} />} Copy {selCount}
            </button>
            <button className="icon-btn" title="Clear selection" onClick={clearSelection}>
              <X size={13} />
            </button>
          </>
        ) : (
          <span className="sub">{items.length}</span>
        )}
        {showFilter && selCount === 0 && (
          <div className="snippet-filter">
            <Search size={12} />
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); e.target.blur() } }}
              placeholder="Filter…  /"
            />
          </div>
        )}
        {onAddItem && selCount === 0 && (
          <button className="btn btn-ghost snippet-add" onClick={() => onAddItem('snippet')}>
            <Plus size={13} /> Command
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="snippet-empty">No commands match “{filter}”.</div>
      )}

      <div className="snippet-rows">
        {filtered.map((item, index) => {
          const firstLine = (item.body || '').split('\n')[0]
          const isMultiline = (item.body || '').includes('\n')
          const isSelected = selected.has(item.id)
          return (
            <div
              key={item.id}
              ref={(el) => { rowRefs.current[index] = el }}
              tabIndex={0}
              className={`snippet-row ${copiedId === item.id ? 'copied' : ''} ${isSelected ? 'selected' : ''}`}
              title="Click to copy · ⇧-click to select"
              onClick={(e) => (e.shiftKey ? toggleSelect(item.id, index, e) : copyRow(item))}
              onKeyDown={(e) => onRowKey(e, item, index)}
            >
              <input
                type="checkbox"
                className="snippet-check"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => toggleSelect(item.id, index, e)}
                tabIndex={-1}
                aria-label={`Select ${item.title}`}
              />
              <span className="snippet-row-label">
                {maxCopies >= 3 && (item.copy_count || 0) >= maxCopies ? (
                  <span className="snippet-star" title={`Copied ${item.copy_count}× — most used`}>★ </span>
                ) : (item.copy_count || 0) > 1 ? (
                  <span className="snippet-uses" title={`Copied ${item.copy_count}×`}>{item.copy_count}× </span>
                ) : null}
                {item.title}
              </span>
              <code className="snippet-row-code">
                <Preview text={firstLine} />
                {isMultiline && <span className="snippet-multi" title="Multi-line — copies full text"> ⧉</span>}
              </code>
              {item.tags?.length > 0 && (
                <span className="snippet-row-tags">
                  {item.tags.slice(0, 2).map((t) => (
                    <span key={t} className="tag">#{t}</span>
                  ))}
                </span>
              )}
              <span className="snippet-row-actions">
                {copiedId === item.id ? (
                  <Check size={14} className="snippet-row-copied" />
                ) : (
                  <Copy size={14} />
                )}
                <button
                  className="icon-btn"
                  title="Edit"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); onEditItem(item) }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className={`icon-btn ${confirmId === item.id ? 'accent' : ''}`}
                  title={confirmId === item.id ? 'Click again to confirm' : 'Delete'}
                  tabIndex={-1}
                  onClick={(e) => handleDelete(item, e)}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {prompt && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPrompt(null) }}>
          <form className="modal snippet-prompt" onSubmit={submitPrompt}>
            <h3>Fill in “{prompt.item.title}”</h3>
            {prompt.fields.map(([name, def], idx) => (
              <div className="field" key={name}>
                <label><code>{`{{${name}}}`}</code>{def && <span className="muted"> — default: {def}</span>}</label>
                <input
                  autoFocus={idx === 0}
                  value={prompt.values[name]}
                  onChange={(e) => setPrompt((p) => ({ ...p, values: { ...p.values, [name]: e.target.value } }))}
                  placeholder={def || name}
                />
              </div>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPrompt(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">
                <Copy size={14} /> Copy filled
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
