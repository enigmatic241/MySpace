import React, { useRef, useState } from 'react'
import { GripVertical, Plus } from 'lucide-react'
import { useStore } from '../store'

/**
 * Draggable list of sections in the sidebar.
 * Drag with the grip handle (or the row) to reorder; persists order via the
 * backend /api/sections/order endpoint.
 */
export default function SectionList({ activeTab, onSelect, onNew, countFor }) {
  const { sections, reorderSections, showToast } = useStore()
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragIndex = useRef(null)

  const onDragStart = (e, s, index) => {
    dragIndex.current = index
    setDragId(s.id)
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', String(s.id))
    } catch { /* older browsers */ }
  }

  const onDragOver = (e, s) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (s.id !== overId) setOverId(s.id)
  }

  const onDrop = async (e, target, targetIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const fromId = dragId != null ? dragId : Number(e.dataTransfer.getData('text/plain'))
    const from = dragIndex.current ?? sections.findIndex((x) => x.id === fromId)
    setDragging(false)
    setOverId(null)
    setDragId(null)

    if (from < 0 || from === targetIndex || fromId == null) return

    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex, 0, moved)
    const ids = next.map((x) => x.id)

    try {
      await reorderSections(ids)
      showToast('Section order saved')
    } catch (err) {
      showToast(`Reorder failed: ${err.message}`)
    }
  }

  const onDragEnd = () => {
    setDragging(false)
    setOverId(null)
    setDragId(null)
  }

  return (
    <div className="section-list">
      {sections.map((s, index) => (
        <div
          key={s.id}
          className={[
            'section-row',
            dragId === s.id ? 'dragging' : '',
            overId === s.id && dragId !== s.id ? 'drop-above' : '',
          ].join(' ')}
          draggable
          onDragStart={(e) => onDragStart(e, s, index)}
          onDragOver={(e) => onDragOver(e, s)}
          onDragLeave={() => overId === s.id && setOverId(null)}
          onDrop={(e) => onDrop(e, s, index)}
          onDragEnd={onDragEnd}
        >
          <span className="grip" title="Drag to reorder">
            <GripVertical size={14} />
          </span>
          <button
            className={`side-link ${activeTab === String(s.id) ? 'active' : ''}`}
            onClick={() => onSelect(String(s.id))}
          >
            <span style={{ color: s.color }}>{s.icon}</span>
            <span className="side-name">{s.name}</span>
            {countFor ? <span className="count">{countFor(s.id)}</span> : null}
          </button>
        </div>
      ))}
      <button className="side-link" onClick={onNew} title="New section">
        <Plus size={14} /> <span className="side-name">New section</span>
      </button>
    </div>
  )
}
