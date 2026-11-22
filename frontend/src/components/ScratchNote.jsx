import React, { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, X } from 'lucide-react'
import { useStore } from '../store'

/**
 * Quick scratch-note popover: open with ⌘⇧E / Ctrl+Shift+E, type a one
 * liner, Enter to save. Creates a `note` item (no section) instantly.
 */
export default function ScratchNote({ onClose }) {
  const { addItem, showToast } = useStore()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    const t = text.trim()
    if (!t) return
    setSaving(true)
    try {
      await addItem({ type: 'note', title: t.split('\n')[0].slice(0, 120), body: t })
      showToast('Scratch note saved ✨')
      onClose()
    } catch (err) {
      showToast(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="scratch-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="scratch">
        <div className="scratch-head">
          <span className="muted">Quick note</span>
          <button className="icon-btn" title="Close" onClick={onClose}><X size={14} /></button>
        </div>
        <textarea
          ref={inputRef}
          className="scratch-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
          placeholder="Type a note… (Enter to save, Shift+Enter for newline)"
          rows={3}
          autoFocus
        />
        <div className="scratch-foot">
          <span className="muted">Enter = save</span>
          <button className="btn btn-primary" disabled={saving || !text.trim()} onClick={save}>
            <CornerDownLeft size={13} /> Save
          </button>
        </div>
      </div>
    </div>
  )
}
