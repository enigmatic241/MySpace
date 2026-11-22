import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const StoreContext = createContext(null)

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export function StoreProvider({ children }) {
  const [sections, setSections] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('workhub.theme')
    if (saved === 'light' || saved === 'dark') return saved
    // Fall back to OS preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
    return 'dark'
  })

  // Apply/remove the light theme class on <html> whenever the theme changes,
  // and persist the choice.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.classList.add('theme-light')
    else root.classList.remove('theme-light')
    localStorage.setItem('workhub.theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  // ---- Recently opened (persisted) ----
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('workhub.recent') || '[]')
    } catch {
      return []
    }
  })

  const recordOpen = useCallback((entry) => {
    setRecent((prev) => {
      const next = [entry, ...prev.filter((e) => !(e.kind === entry.kind && e.id === entry.id))].slice(0, 8)
      try {
        localStorage.setItem('workhub.recent', JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecent([])
    try { localStorage.removeItem('workhub.recent') } catch { /* ignore */ }
  }, [])

  // ---- Recently copied commands (persisted) ----
  const [recentCopied, setRecentCopied] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('workhub.copied') || '[]')
    } catch {
      return []
    }
  })

  const recordCopy = useCallback((entry) => {
    setRecentCopied((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 8)
      try {
        localStorage.setItem('workhub.copied', JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
    // Durable usage stats for "most used" ordering — fire and forget.
    api.recordCopy(entry.id).catch(() => {})
    setItems((prev) => prev.map((i) => (i.id === entry.id
      ? { ...i, copy_count: (i.copy_count || 0) + 1 }
      : i)))
  }, [])

  const clearRecentCopied = useCallback(() => {
    setRecentCopied([])
    try { localStorage.removeItem('workhub.copied') } catch { /* ignore */ }
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [sec, it] = await Promise.all([api.listSections(), api.listItems()])
      setSections(sec)
      setItems(it)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ---- Sections ----
  const addSection = useCallback(async (data) => {
    const created = await api.createSection(data)
    setSections((s) => [...s, created])
    return created
  }, [])

  const updateSection = useCallback(async (id, data) => {
    const updated = await api.updateSection(id, data)
    setSections((s) => s.map((x) => (x.id === id ? updated : x)))
  }, [])

  const removeSection = useCallback(async (id) => {
    await api.deleteSection(id)
    setSections((s) => s.filter((x) => x.id !== id))
    setItems((its) => its.map((i) => (i.section_id === id ? { ...i, section_id: null } : i)))
  }, [])

  // Reorder sections optimistically: update local state immediately, then
  // persist to backend. On failure, refresh from server to revert.
  const reorderSections = useCallback(async (ids) => {
    const prev = sections
    setSections((s) => {
      const byId = new Map(s.map((sec) => [sec.id, sec]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    })
    try {
      await api.reorderSections(ids)
    } catch (err) {
      setSections(prev)
      throw err
    }
  }, [sections])

  // ---- Items ----
  const addItem = useCallback(async (data) => {
    const created = await api.createItem(data)
    setItems((its) => [created, ...its])
    return created
  }, [])

  const updateItem = useCallback(async (id, data) => {
    const updated = await api.updateItem(id, data)
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...updated } : i)))
  }, [])

  const toggleDone = useCallback(async (id, done) => {
    const updated = await api.updateItem(id, { done })
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...updated } : i)))
  }, [])

  const togglePinned = useCallback(async (id, pinned) => {
    const updated = await api.updateItem(id, { pinned })
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...updated } : i)))
  }, [])

  const removeItem = useCallback(async (id) => {
    await api.deleteItem(id)
    setItems((its) => its.filter((i) => i.id !== id))
  }, [])

  // ---- Export / Import ----
  const exportData = useCallback(async () => {
    const payload = await api.exportData()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workhub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Backup downloaded 📦')
  }, [showToast])

  const importData = useCallback(async (file) => {
    const text = await file.text()
    const payload = JSON.parse(text)
    const result = await api.importData(payload)
    await refresh()
    showToast(`Imported ${result.imported} items + ${result.sections} sections`)
  }, [refresh, showToast])

  const value = useMemo(
    () => ({
      sections,
      items,
      loading,
      error,
      toast,
      showToast,
      theme,
      toggleTheme,
      refresh,
      addSection,
      updateSection,
      removeSection,
      addItem,
      updateItem,
      toggleDone,
      togglePinned,
      removeItem,
      reorderSections,
      exportData,
      importData,
      recent,
      recordOpen,
      clearRecent,
      recentCopied,
      recordCopy,
      clearRecentCopied,
    }),
    [sections, items, loading, error, toast, showToast, theme, toggleTheme, refresh,
     addSection, updateSection, removeSection, addItem, updateItem, toggleDone,
     togglePinned, removeItem, reorderSections, exportData, importData,
     recent, recordOpen, clearRecent, recentCopied, recordCopy, clearRecentCopied],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
