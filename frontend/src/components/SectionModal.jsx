import React, { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import EmojiPicker from './EmojiPicker'

const PRESET_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#f472b6', '#94a3b8']

export default function SectionModal({ initial, onClose }) {
  const { addSection, updateSection, removeSection, showToast } = useStore()
  const [name, setName] = useState(initial?.name || '')
  const [icon, setIcon] = useState(initial?.icon || '📁')
  const [color, setColor] = useState(initial?.color || '#22d3ee')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (initial) {
        await updateSection(initial.id, { name, icon, color })
        showToast('Section updated')
      } else {
        await addSection({ name, icon, color, sort: 0 })
        showToast('Section added')
      }
      onClose()
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2500)
      return
    }
    await removeSection(initial.id)
    showToast('Section deleted (items moved to no-section)')
    onClose()
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h3>{initial ? 'Edit section' : 'New section'}</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label>Name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Observability" />
          </div>

          <div className="field">
            <label>Icon</label>
            <div className="icon-picker-row">
              <div className="icon-picker-preview">{icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EmojiPicker value={icon} onChange={setIcon} />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Color</label>
            <div className="flex" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 26, height: 26, borderRadius: 7, background: c,
                    border: color === c ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            {initial && (
              <button
                type="button"
                className={`btn ${confirmDelete ? 'btn-primary' : ''}`}
                style={{ marginRight: 'auto', color: confirmDelete ? 'var(--on-primary)' : 'var(--red)' }}
                onClick={handleDelete}
              >
                <Trash2 size={14} /> {confirmDelete ? 'Confirm?' : 'Delete'}
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
