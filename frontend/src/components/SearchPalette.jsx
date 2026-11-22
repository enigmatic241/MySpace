import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CornerDownLeft, FileText } from 'lucide-react'
import { useStore } from '../store'
import { favicon, TYPE_EMOJI } from '../utils'
import { loadDocs } from '../docs/storage'

function scoreQuery(text, query) {
  const q = query.toLowerCase()
  const t = (text || '').toLowerCase()
  if (t === q) return 2
  if (t.startsWith(q)) return 1.5
  if (t.includes(q)) return 1
  return 0
}

function scoreItem(item, query) {
  return (
    scoreQuery(item.title, query) +
    scoreQuery(item.body, query) * 0.4 +
    scoreQuery((item.tags || []).join(' '), query) * 0.6 +
    (item.pinned ? 0.2 : 0)
  )
}

function scoreDoc(doc, query) {
  return scoreQuery(doc.title, query) + scoreQuery(doc.content, query) * 0.5
}

export default function SearchPalette({ onClose, onSelect, onOpenDoc, onSelectSection }) {
  const { items, sections } = useStore()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const docs = useMemo(() => loadDocs(), [])

  function sectionName(id) {
    return sections.find((s) => s.id === id)?.name || 'No section'
  }

  // Unified results list: items, docs, sections — each with a `kind`.
  const results = useMemo(() => {
    const query = q.trim()
    const out = []

    items.forEach((it) => {
      const s = query ? scoreItem(it, query) : 0.1
      if (s > 0) out.push({ kind: 'item', it, s, title: it.title, meta: `${it.type} · ${sectionName(it.section_id)}` })
    })

    docs.forEach((d) => {
      const s = query ? scoreDoc(d, query) : 0.1
      if (s > 0) out.push({ kind: 'doc', d, s, title: d.title || 'Untitled', meta: `doc · ${d.format === 'md' ? 'markdown' : 'text'}` })
    })

    sections.forEach((sec) => {
      const s = query ? scoreQuery(sec.name, query) : 0.1
      if (s > 0) out.push({ kind: 'section', sec, s, title: sec.name, meta: 'section' })
    })

    out.sort((a, b) => b.s - a.s || a.title.localeCompare(b.title))
    return out.slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, docs, sections, q])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [q])

  const openResult = (r) => {
    if (r.kind === 'item') {
      onSelect?.(r.it)
    } else if (r.kind === 'doc') {
      onOpenDoc?.(r.d.id)
    } else {
      onSelectSection?.(String(r.sec.id))
    }
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      openResult(results[active])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="palette">
        <div className="palette-input">
          <span style={{ color: 'var(--accent)' }}>⌘</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search items, docs, sections…"
          />
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>esc</kbd>
        </div>

        <div className="palette-results">
          {results.length === 0 && (
            <div className="palette-empty">
              No matches for “{q}”.
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.kind}-${r.kind === 'item' ? r.it.id : r.kind === 'doc' ? r.d.id : r.sec.id}`}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => openResult(r)}
            >
              <div className="p-icon">
                {r.kind === 'item' && (r.it.icon || (!favicon(r.it.url) && TYPE_EMOJI[r.it.type]) || <img src={favicon(r.it.url)} alt="" />)}
                {r.kind === 'doc' && <FileText size={14} />}
                {r.kind === 'section' && <span style={{ color: r.sec.color }}>{r.sec.icon}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="p-title">{r.title}</div>
                <div className="p-meta">{r.meta}</div>
              </div>
              <div className="p-arrow">
                {i === active ? <CornerDownLeft size={14} /> : <ArrowRight size={14} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
