import React, { useEffect, useRef, useState } from 'react'
import { Link2, StickyNote, CheckSquare, ClipboardCopy, Maximize2, Minimize2, FileDown } from 'lucide-react'
import { useStore } from '../store'
import EmojiPicker from './EmojiPicker'

const TYPES = [
  { key: 'link', label: 'Link', icon: <Link2 size={15} /> },
  { key: 'note', label: 'Note', icon: <StickyNote size={15} /> },
  { key: 'todo', label: 'Todo', icon: <CheckSquare size={15} /> },
  { key: 'snippet', label: 'Snippet', icon: <ClipboardCopy size={15} /> },
]

const EMPTY = { title: '', type: 'link', url: '', body: '', section_id: null, tags: [], due_date: '', pinned: false, is_md: false, icon: null }

export default function ItemModal({ initial, onClose, clipboardUrl, defaults }) {
  const { sections, addItem, updateItem, showToast } = useStore()
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        ...EMPTY,
        ...initial,
        url: initial.url || '',
        body: initial.body || '',
        due_date: initial.due_date || '',
      }
    }
    if (clipboardUrl) {
      return { ...EMPTY, type: 'link', url: clipboardUrl }
    }
    if (defaults) {
      return { ...EMPTY, ...defaults }
    }
    return EMPTY
  })
  const [tagsText, setTagsText] = useState((initial?.tags || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [writeMode, setWriteMode] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const bodyRef = useRef(null)
  const dragDepth = useRef(0)

  // Best-effort: try to fetch the page title for a pasted URL.
  useEffect(() => {
    if (!clipboardUrl) return
    let cancelled = false
    fetch(clipboardUrl, { mode: 'cors', headers: { Accept: 'text/html' } })
      .then((r) => r.text())
      .then((html) => {
        if (cancelled) return
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        if (m && m[1].trim()) {
          setForm((f) => (f.title ? f : { ...f, title: m[1].trim().slice(0, 120) }))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [clipboardUrl])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // In write mode, Esc returns to the normal modal instead of closing.
        if (writeMode) { setWriteMode(false); return }
        onClose()
      }
      // ⌘⏎ toggles focus-writer mode on note bodies.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && form.type === 'note') {
        e.preventDefault()
        setWriteMode((w) => !w)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, writeMode, form.type])

  // ---- Big content: drop a .md/.txt file (or plain text) into the body ----
  const readFileIntoForm = (file) => {
    const name = file.name.replace(/\.[^.]+$/, '')
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      set((f) => ({
        type: 'note',
        body: f.body ? f.body + (f.body.endsWith('\n') ? '' : '\n\n') + text : text,
        title: f.title || name.slice(0, 120),
        is_md: /\.(md|markdown)$/i.test(file.name) ? true : f.is_md,
      }))
      bodyRef.current?.focus()
    }
    reader.readAsText(file)
  }

  const onDrop = (e) => {
    dragDepth.current = 0
    setDragOver(false)
    if (form.type !== 'note' && form.type !== 'snippet') return
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) { readFileIntoForm(file); return }
    const text = e.dataTransfer?.getData('text/plain')
    if (text) set((f) => ({ body: f.body ? f.body + '\n\n' + text : text }))
  }

  const onPasteBody = (e) => {
    // Pasting a file (e.g. copied from Finder) into a note body → load .md/.txt.
    if (form.type !== 'note') return
    const file = e.clipboardData?.files?.[0]
    if (file && /\.(md|markdown|txt)$/i.test(file.name)) {
      e.preventDefault()
      readFileIntoForm(file)
    } else if (file) {
      e.preventDefault()
      showToast('Only .md / .txt files can be attached')
    }
  }

  const set = (patch) => setForm((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      type: form.type,
      title: form.title.trim(),
      section_id: form.section_id || null,
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      pinned: Boolean(form.pinned),
      icon: form.icon || null,
    }
    if (form.type === 'link') payload.url = form.url.trim() || null
    if (form.type === 'note') {
      payload.body = form.body
      payload.is_md = Boolean(form.is_md)
    }
    if (form.type === 'snippet') payload.body = form.body
    if (form.type === 'todo') payload.due_date = form.due_date || null

    try {
      if (initial) {
        await updateItem(initial.id, payload)
        showToast('Saved ✨')
        onClose()
      } else {
        await addItem(payload)
        if (addAnother) {
          // Rapid capture: keep section/type, clear the content fields.
          showToast('Added — add another ✨')
          setForm((f) => ({ ...EMPTY, type: f.type, section_id: f.section_id, is_md: f.is_md }))
          setTagsText('')
          setWriteMode(false)
          bodyRef.current?.focus()
        } else {
          showToast('Added to WorkHub ✨')
          onClose()
        }
      }
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  const showUrl = form.type === 'link'
  const showBody = form.type === 'note'
  const showSnippet = form.type === 'snippet'
  const showDue = form.type === 'todo'
  const bigBody = showBody && writeMode

  const dropHandlers = (showBody || showSnippet) && {
    onDragEnter: (e) => { e.preventDefault(); dragDepth.current += 1; setDragOver(true) },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false) },
    onDrop,
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${bigBody ? 'write-mode' : ''}`} {...dropHandlers}>
        <h3>
          {initial ? 'Edit item' : 'Add to WorkHub'}
          {bigBody && <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 10 }}>Focus mode · <kbd className="kbd-sm">esc</kbd> to shrink</span>}
        </h3>

        <div className="type-pills">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`type-pill ${form.type === t.key ? 'active' : ''}`}
              onClick={() => set({ type: t.key })}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Title *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <button
                type="button"
                className="icon-picker-preview"
                title="Pick an icon for this item"
                onClick={() => setShowIconPicker((v) => !v)}
              >
                {form.icon || '🙂'}
              </button>
              <input
                autoFocus
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder={form.type === 'link' ? 'e.g. Grafana — Latency Explorer' : 'Title'}
                required
                style={{ flex: 1 }}
              />
            </div>
            {showIconPicker && (
              <div style={{ marginTop: 6, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--card)' }}>
                <EmojiPicker
                  value={form.icon}
                  onChange={(e) => { set({ icon: e }); setShowIconPicker(false) }}
                  onClear={() => { set({ icon: null }); setShowIconPicker(false) }}
                />
              </div>
            )}
          </div>

          {!bigBody && !showUrl && !showBody && !showSnippet && (
            <div className="row-2">
              <div className="field">
                <label>Due date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => set({ due_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Section</label>
                <select
                  value={form.section_id ?? ''}
                  onChange={(e) => set({ section_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">No section</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {!bigBody && showUrl && (
            <div className="field">
              <label>URL</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => set({ url: e.target.value })}
                placeholder="https://grafana.example.com/d/…"
              />
            </div>
          )}

          {(showBody || showSnippet) && (
            <>
              <div className={`field big-body-area ${dragOver ? '' : ''}`}>
                <div className="body-field-head">
                  <label>{showSnippet ? 'Text (copied to clipboard)' : 'Body'}</label>
                  {showBody && (
                    <button
                      type="button"
                      className="write-mode-btn"
                      onClick={() => setWriteMode((w) => !w)}
                      title={writeMode ? 'Shrink editor (Esc)' : 'Expand to focus writer (⌘⏎)'}
                    >
                      {writeMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                      {writeMode ? 'Shrink' : 'Focus writer'}
                    </button>
                  )}
                </div>
                <textarea
                  ref={bodyRef}
                  value={form.body}
                  onChange={(e) => set({ body: e.target.value })}
                  onPaste={onPasteBody}
                  className={showSnippet ? 'mono-area' : ''}
                  placeholder={showSnippet
                    ? 'feat(auth): add JWT refresh flow\n\n- rotate tokens on expiry\n- add regression test'
                    : 'Write your note… drop a .md/.txt file anywhere in this dialog, or paste one from Finder.'}
                />
                {showBody && !writeMode && (
                  <div className={`dropzone-hint ${dragOver ? 'drag-over' : ''}`}>
                    <FileDown size={13} />
                    {dragOver
                      ? 'Drop it — the file becomes your note.'
                      : <>Bigger content? Drop a <code>.md</code>/<code>.txt</code> file here, or press <kbd className="kbd-sm">⌘⏎</kbd> for the focus writer.</>}
                  </div>
                )}
                {showSnippet && (
                  <div className="hint field-hint">
                    Use <code>{'{{name}}'}</code> or <code>{'{{name:default}}'}</code> for values
                    you fill in at copy time — e.g. <code>git checkout {'{{branch:main}}'}</code>
                  </div>
                )}
              </div>

              {showBody && (
                <label className="flex muted md-toggle" style={{ cursor: 'pointer', marginBottom: 13 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_md)}
                    onChange={(e) => set({ is_md: e.target.checked })}
                  />
                  <span>Render this note as <b>Markdown</b></span>
                  <span className="md-badge" style={{ marginLeft: 4 }}>MD</span>
                </label>
              )}

          {!bigBody && (
              <div className="row-2">
                <div className="field">
                  <label>Section</label>
                  <select
                    value={form.section_id ?? ''}
                    onChange={(e) => set({ section_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">No section</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Tags</label>
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="grafana, ops" />
                </div>
              </div>
          )}
            </>
          )}

          {!bigBody && showUrl && (
            <div className="row-2">
              <div className="field">
                <label>Section</label>
                <select
                  value={form.section_id ?? ''}
                  onChange={(e) => set({ section_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">No section</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Tags</label>
                <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="grafana, ops" />
              </div>
            </div>
          )}

          {!bigBody && (
          <div className="row-2">
            <label className="flex muted" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => set({ pinned: e.target.checked })}
              />
              Pin to top
            </label>
            {!initial && (
              <label className="flex muted" style={{ cursor: 'pointer', justifyContent: 'flex-end' }}>
                <input
                  type="checkbox"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                />
                Save &amp; add another
              </label>
            )}
          </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : initial ? 'Save' : (addAnother ? 'Add & next' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
