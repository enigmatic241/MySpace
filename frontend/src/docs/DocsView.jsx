import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download, FilePlus2, FileText, Search, Upload, X,
} from 'lucide-react'
import { useStore } from '../store'
import {
  loadDocs, saveDocs, loadTabs, saveTabs, uid, exportDocsJSON, parseDocsJSON,
} from './storage'
import DocEditor from './DocEditor'

const MAX_TABS = 5

function newDoc(title = 'Untitled document', format = 'md', content = '') {
  const now = new Date().toISOString()
  return {
    id: uid(),
    title,
    format,
    content,
    createdAt: now,
    updatedAt: now,
  }
}

export default function DocsView({ showToast, openDocId, onDocOpened }) {
  const { showToast: storeToast, theme: globalTheme } = useStore()
  const notify = showToast || storeToast

  const [docs, setDocs] = useState(loadDocs)
  const [openTabs, setOpenTabs] = useState(() => loadTabs())
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch] = useState('')
  // Docs keeps its own theme override, but follows the global app theme by default.
  const [theme, setTheme] = useState(() => localStorage.getItem('workhub.docsTheme') || globalTheme || 'dark')
  const [viewMode, setViewMode] = useState(() => {
    const m = localStorage.getItem('workhub.docViewMode') || 'split'
    return m === 'editor' ? 'edit' : m
  })
  const fileRef = useRef(null)

  // Persist docs on every change
  useEffect(() => {
    saveDocs(docs)
  }, [docs])

  // Persist open tabs (ids) + active doc to localStorage so a refresh keeps you where you were
  useEffect(() => {
    saveTabs(openTabs)
  }, [openTabs])

  useEffect(() => {
    if (activeId != null) localStorage.setItem('workhub.docActive', activeId)
    else localStorage.removeItem('workhub.docActive')
  }, [activeId])

  // Restore the last-active doc once docs are loaded and its tab exists
  useEffect(() => {
    if (activeId === null && openTabs.length > 0) {
      const saved = localStorage.getItem('workhub.docActive')
      if (saved && docs.some((d) => d.id === saved) && openTabs.includes(saved)) {
        setActiveId(saved)
      } else {
        setActiveId(openTabs[openTabs.length - 1])
      }
    }
  }, [docs, openTabs, activeId])

  // Persist theme + view mode choices
  useEffect(() => {
    localStorage.setItem('workhub.docsTheme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('workhub.docViewMode', viewMode)
  }, [viewMode])

  const sortedDocs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...docs]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
  }, [docs, search])

  const activeDoc = docs.find((d) => d.id === activeId) || null

  const openTab = useCallback((id) => {
    setOpenTabs((tabs) => {
      if (tabs.includes(id)) return tabs
      if (tabs.length >= MAX_TABS) return [...tabs.slice(1), id] // rotate oldest out
      return [...tabs, id]
    })
    setActiveId(id)
  }, [])

  // Open a doc requested from elsewhere (e.g. global ⌘K search).
  useEffect(() => {
    if (openDocId && docs.some((d) => d.id === openDocId)) {
      openTab(openDocId)
      onDocOpened?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDocId, docs])

  const closeTab = (id) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== id)
      if (activeId === id) {
        setActiveId(next.length ? next[next.length - 1] : null)
      }
      return next
    })
  }

  const createDoc = (format = 'md') => {
    const doc = newDoc(undefined, format)
    setDocs((ds) => [doc, ...ds])
    openTab(doc.id)
  }

  const updateDoc = useCallback((id, value, field = 'content', format) => {
    setDocs((ds) => ds.map((d) => {
      if (d.id !== id) return d
      const next = { ...d, updatedAt: new Date().toISOString() }
      if (field === 'content') next.content = value
      if (field === 'title') next.title = value
      if (field === 'format') next.format = format
      return next
    }))
  }, [])

  const deleteDoc = (id) => {
    setDocs((ds) => ds.filter((d) => d.id !== id))
    setOpenTabs((tabs) => tabs.filter((t) => t !== id))
    if (activeId === id) setActiveId(null)
    notify('Document deleted')
  }

  const duplicateDoc = (id) => {
    const src = docs.find((d) => d.id === id)
    if (!src) return
    const copy = { ...src, id: uid(), title: `${src.title} (copy)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    setDocs((ds) => [copy, ...ds])
    openTab(copy.id)
    notify('Duplicated')
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const text = await file.text()
      const name = file.name.replace(/\.[^.]+$/, '')
      const format = /\.(md|markdown)$/i.test(file.name) ? 'md' : 'txt'
      const doc = newDoc(name, format, text)
      setDocs((ds) => [doc, ...ds])
      openTab(doc.id)
      notify(`Imported “${file.name}”`)
    }
    e.target.value = ''
  }

  const handleExport = () => {
    exportDocsJSON(docs)
    notify('Docs exported')
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const list = parseDocsJSON(await file.text())
        setDocs((ds) => [...list, ...ds])
        notify(`Imported ${list.length} docs`)
      } catch (err) {
        notify(`Import failed: ${err.message}`)
      }
    }
    e.target.value = ''
  }

  return (
    <div className="docs-view">
      <div className="docs-head">
        <h2>📄 Documents</h2>
        <div className="docs-actions">
          <div className="docs-search">
            <Search size={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs…"
            />
          </div>
          <button className="btn" onClick={() => createDoc('md')}><FilePlus2 size={14} /> New doc</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload</button>
          <input ref={fileRef} type="file" accept=".md,.txt,.json" style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-ghost" onClick={handleExport} title="Export docs"><Download size={14} /> Export</button>
          <button className="btn btn-ghost" onClick={() => document.getElementById('docs-import-file')?.click()} title="Import docs"><Upload size={14} /></button>
          <input id="docs-import-file" type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      {/* Tab bar */}
      {openTabs.length > 0 && (
        <div className="docs-tabs">
          {openTabs.map((id) => {
            const t = docs.find((d) => d.id === id)
            if (!t) return null
            return (
              <div
                key={id}
                className={`docs-tab ${activeId === id ? 'active' : ''}`}
                onClick={() => setActiveId(id)}
              >
                <span className="doc-tab-icon">{t.format === 'md' ? 'M↓' : '📄'}</span>
                <span className="doc-tab-title">{t.title || 'Untitled'}</span>
                <button
                  className="icon-btn"
                  title="Close tab"
                  onClick={(e) => { e.stopPropagation(); closeTab(id) }}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          <span className="muted doc-tab-hint">{openTabs.length}/{MAX_TABS} tabs</span>
        </div>
      )}

      <div className="docs-layout">
        {/* Doc list */}
        <div className="docs-side">
          {sortedDocs.length === 0 ? (
            <div className="docs-empty">
              <FileText size={28} />
              <p>No documents yet.<br />Create one or upload a file.</p>
            </div>
          ) : (
            sortedDocs.map((d) => (
              <div
                key={d.id}
                className={`docs-list-item ${activeId === d.id ? 'active' : ''}`}
                onClick={() => openTab(d.id)}
              >
                <span className="docs-list-icon">{d.format === 'md' ? 'M↓' : '📄'}</span>
                <div className="docs-list-main">
                  <div className="docs-list-title">{d.title || 'Untitled'}</div>
                  <div className="docs-list-meta">
                    {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor / preview */}
        <div className="docs-editor-wrap">
          {activeDoc ? (
            <DocEditor
              doc={activeDoc}
              theme={theme}
              onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              onChange={(value, field, format) => updateDoc(activeDoc.id, value, field, format)}
              onDelete={() => deleteDoc(activeDoc.id)}
              onDuplicate={() => duplicateDoc(activeDoc.id)}
              viewMode={viewMode}
              onViewMode={setViewMode}
            />
          ) : (
            <div className="docs-placeholder">
              <FileText size={40} />
              <p>Select a document from the list, or create a new one.</p>
              <button className="btn btn-primary" onClick={() => createDoc('md')}>
                <FilePlus2 size={14} /> New doc
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
