import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

// Curated emoji set grouped by theme — good enough for icons without
// shipping an emoji-data dataset. Values are raw emoji strings.
const GROUPS = [
  {
    name: 'Work',
    icons: ['📁', '📂', '🗂️', '📋', '📌', '📎', '📝', '✏️', '📄', '📃', '🗒️', '📅', '⏰', '⏳', '🎯', '✅', '☑️', '🔖', '🔗', '🔀'],
  },
  {
    name: 'Tech',
    icons: ['💻', '🖥️', '⌨️', '🖱️', '💾', '🗄️', '🛠️', '⚙️', '🧩', '🔌', '📡', '🤖', '🧪', '🔬', '🐛', '🚧', '🔒', '🔑', '🛰️', '📦'],
  },
  {
    name: 'Data & charts',
    icons: ['📊', '📈', '📉', '🗓️', '🧮', '💹', '🔢', '🕸️', '🌐', '☁️', '🗺️', '🧭', '🔍', '🔎', '💡', '⚡', '🔥', '💥', '🌡️', '🧷'],
  },
  {
    name: 'Fun & misc',
    icons: ['🚀', '⭐', '🌟', '✨', '💎', '🏆', '🎨', '🎧', '🎮', '☕', '🍕', '🏠', '❤️', '😀', '🤔', '👀', '🙌', '💪', '🌱', '🌙'],
  },
]
const ALL = GROUPS.flatMap((g) => g.icons)

// Light-weight name hints so "rocket" finds 🚀 — intentionally tiny.
const KEYWORDS = {
  '🚀': 'rocket launch ship', '📁': 'folder file directory', '📊': 'chart bar graph data',
  '🔗': 'link url chain', '📝': 'note writing memo pad', '✅': 'todo check done task',
  '📋': 'clipboard copy snippet command', '💡': 'idea light bulb', '⚡': 'fast zap lightning energy',
  '🔥': 'fire hot burn', '⭐': 'star favorite', '🎯': 'target goal dart', '⏰': 'clock time alarm due',
  '📅': 'calendar date schedule', '🔒': 'lock secure private secret', '🔑': 'key secret password',
  '🐛': 'bug error issue', '🛠️': 'tools fix wrench build', '⚙️': 'settings gear config',
  '💻': 'laptop computer code dev', '☁️': 'cloud aws infra', '🧪': 'test lab experiment',
  '🔍': 'search find magnifier', '📌': 'pin pinned', '🌱': 'plant seed new grow',
  '☕': 'coffee break', '🏠': 'home house', '💾': 'save disk storage', '🗄️': 'database db archive',
  '🤖': 'bot ai robot agent', '🧩': 'plugin puzzle extension', '📡': 'network api feed rss',
}

/**
 * Compact emoji picker: grid of curated emoji with a search box.
 * Props: value (current emoji), onChange(next), onClear? (removes custom icon).
 */
export default function EmojiPicker({ value, onChange, onClear }) {
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return GROUPS
    const hits = ALL.filter(
      (e) => e.includes(query) || (KEYWORDS[e] || '').includes(query),
    )
    const extra = value && !hits.includes(value) ? [value] : []
    return [{ name: 'Results', icons: [...extra, ...hits] }]
  }, [q, value])

  const empty = shown.length === 0 || (shown.length === 1 && shown[0].icons.length === 0)

  return (
    <div className="emoji-picker">
      <div className="field" style={{ marginBottom: 6 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--text-faint)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search emoji (rocket, chart, lock…)"
            style={{ paddingLeft: 28, fontSize: 12.5 }}
          />
        </div>
      </div>
      {empty && <div className="muted" style={{ fontSize: 12, padding: '4px 2px' }}>No emoji match “{q}”.</div>}
      {shown.map((g) => (
        <div key={g.name} className="emoji-group">
          {g.icons.length > 6 && !q && <div className="muted emoji-group-name">{g.name}</div>}
          <div className="emoji-grid">
            {g.icons.map((e) => (
              <button
                key={e}
                type="button"
                className={value === e ? 'selected' : ''}
                onClick={() => { onChange(e); setQ('') }}
                title={KEYWORDS[e] || e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
      {onClear && value && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={onClear}>
          Clear icon (use default)
        </button>
      )}
    </div>
  )
}
