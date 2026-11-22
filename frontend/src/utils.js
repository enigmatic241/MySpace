// Shared helpers: favicon URL + type icon mapping + date helpers.

export function favicon(url) {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    return null
  }
}

export function humanDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function dueState(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''))
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  return 'future'
}

export function isToday(dateStr) {
  return dueState(dateStr) === 'today'
}

// Emoji fallback per type if no favicon available.
export const TYPE_EMOJI = {
  link: '🔗',
  note: '📝',
  todo: '✅',
  snippet: '📋',
}
