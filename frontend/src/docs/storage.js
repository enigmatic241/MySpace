// Local-only document storage for the Docs workspace.
// Uses localStorage — fully independent of the WorkHub API/backend.

const KEY = 'workhub.docs.v1'

export function uid() {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadDocs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDocs(docs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs))
    return true
  } catch {
    return false
  }
}

export function clearDocs() {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

const TABS_KEY = 'workhub.docsTabs'

export function loadTabs() {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTabs(ids) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(ids))
  } catch { /* ignore */ }
}

// ---- Export / import (separate JSON file for docs) ----
export function exportDocsJSON(docs) {
  const payload = { app: 'workhub-docs', version: 1, exportedAt: new Date().toISOString(), docs }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workhub-docs-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseDocsJSON(text) {
  const payload = JSON.parse(text)
  const docs = payload?.docs
  if (!Array.isArray(docs)) throw new Error('Not a valid WorkHub docs backup')
  return docs
}
