import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Download, FileText, LayoutDashboard, Moon, Plus, Search, Settings, Sun, Terminal, Upload, X } from 'lucide-react'
import { StoreProvider, useStore } from './store'
import ItemCard from './components/ItemCard'
import ItemDrawer from './components/ItemDrawer'
import ItemModal from './components/ItemModal'
import SectionList from './components/SectionList'
import SectionModal from './components/SectionModal'
import SearchPalette from './components/SearchPalette'
import ScratchNote from './components/ScratchNote'
import SnippetPanel from './components/SnippetPanel'
import DocsView from './docs/DocsView'
import { TYPE_EMOJI, isToday, dueState } from './utils'

// ---------------------------------------------------------------- App shell
function Shell() {
  const {
    sections, items, loading, error, toast, showToast,
    exportData, importData, toggleDone, theme, toggleTheme,
    recordOpen, recent, clearRecent, addItem,
  } = useStore()

  const [activeTab, setActiveTab] = useState(() => {
    // On first load, honor the URL hash so refresh keeps the same view.
    const h = window.location.hash.replace(/^#\/?/, '') || ''
    return h || 'all'
  })
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemDefaults, setItemDefaults] = useState(null)
  const [clipboardUrl, setClipboardUrl] = useState(null)
  const [drawerItem, setDrawerItem] = useState(null)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [showPalette, setShowPalette] = useState(false)
  const [showScratch, setShowScratch] = useState(false)
  const [quickCapture, setQuickCapture] = useState(null)
  const [pendingDocId, setPendingDocId] = useState(null)
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('workhub.nav.collapsed') === '1',
  )
  // Sections collapsed on the "All items" board (persisted).
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('workhub.sections.collapsed') || '[]')) }
    catch { return new Set() }
  })
  const fileRef = useRef(null)

  const toggleSectionCollapsed = useCallback((id) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('workhub.sections.collapsed', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const collapseAllSections = useCallback((value) => {
    setCollapsedSections(() => {
      const next = value ? new Set(sections.map((s) => s.id).filter((id) =>
        items.some((i) => i.section_id === id))) : new Set()
      try { localStorage.setItem('workhub.sections.collapsed', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [sections, items])

  const toggleNav = () => {
    setNavCollapsed((c) => {
      localStorage.setItem('workhub.nav.collapsed', c ? '0' : '1')
      return !c
    })
  }

  // Keep URL hash in sync with the active view so refresh lands back on the
  // same screen (docs, due-today, a specific section, etc.).
  useEffect(() => {
    const h = window.location.hash.replace(/^#\/?/, '')
    if (h !== activeTab) {
      window.history.replaceState(null, '', `#/${activeTab}`)
    }
  }, [activeTab])

  // Listen for back/forward hash changes.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '')
      if (h) setActiveTab(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ---- Keyboard: Cmd/Ctrl+Shift+P palette, Cmd/Ctrl+Shift+A new item, Cmd/Ctrl+V paste URL ----
  useEffect(() => {
    const onKey = (e) => {
      // Palette: ⌘⇧P / Ctrl+Shift+P — ⌘K is reserved by Chrome for "Focus address bar".
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setShowPalette((s) => !s)
      }
      // Add item: ⌘⇧A / Ctrl+Shift+A — ⌘N is reserved by Chrome for "New Window".
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setEditingItem(null)
        setItemDefaults(null)
        setShowItemModal(true)
      }
      // Scratch note: ⌘⇧E / Ctrl+Shift+E — ⌘⇧N and ⌘⌥N are both reserved
      // by Chrome (Incognito Window / Split View).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setShowScratch(true)
      }
      // Quick command capture: ⌘⇧M / Ctrl+Shift+M — a tiny overlay to save
      // commit messages/commands. (⌘⇧S is Chrome's "Save Page As…".)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setQuickCapture({ title: '', body: '', section_id: null })
      }
      // Paste-to-add: if clipboard holds a URL (and we're not typing in a field),
      // open the Add modal prefilled as a link.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        const tag = (e.target.tagName || '').toLowerCase()
        const typing = tag === 'input' || tag === 'textarea' || document.querySelector('.overlay, .palette-overlay, .drawer-overlay')
        if (typing) return
        try {
          navigator.clipboard?.readText().then((text) => {
            const url = (text || '').trim()
            if (/^https?:\/\/\S+$/i.test(url) || /^[\w.-]+\.[a-z]{2,}\S*$/i.test(url)) {
              e.preventDefault()
              setClipboardUrl(url.startsWith('http') ? url : `https://${url}`)
              setEditingItem(null)
              setItemDefaults(null)
              setShowItemModal(true)
            }
          }).catch(() => {})
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- Day-start notification for due-today todos ----
  useEffect(() => {
    if (!window.Notification) return
    const dueToday = items.filter((i) => i.type === 'todo' && !i.done && isToday(i.due_date))
    if (dueToday.length > 0 && window.Notification?.permission === 'granted') {
      const names = dueToday.slice(0, 3).map((t) => t.title).join(', ')
      new Notification('WorkHub — due today', { body: names })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const askNotification = () => {
    if (!window.Notification) return showToast('Notifications not supported')
    window.Notification.requestPermission().then((p) =>
      showToast(p === 'granted' ? 'Notifications enabled 🔔' : 'Notifications denied'),
    )
  }

  // ---- Derived: current set of visible items ----
  const visibleItems = useMemo(() => {
    let list = items
    if (activeTab !== 'all') {
      if (activeTab === 'today') {
        list = list.filter((i) => (i.type === 'todo' ? isToday(i.due_date) : false) || i.pinned)
      } else if (activeTab === 'commands') {
        list = list.filter((i) => i.type === 'snippet')
      } else {
        const id = Number(activeTab)
        list = list.filter((i) => i.section_id === id)
      }
    }
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.done !== b.done) return a.done ? 1 : -1
      return (a.sort || 0) - (b.sort || 0) || new Date(b.created_at) - new Date(a.created_at)
    })
  }, [items, activeTab])

  const allPinned = useMemo(() => items.filter((i) => i.pinned), [items])

  const dueTodayCount = useMemo(
    () => items.filter((i) => i.type === 'todo' && !i.done && isToday(i.due_date)).length,
    [items],
  )

  // ---- Section grouping for dashboard view ----
  const sectionsWithItems = useMemo(() => {
    return sections.map((sec) => ({
      ...sec,
      sectionItems: visibleItems.filter((i) => i.section_id === sec.id),
    }))
  }, [sections, visibleItems])

  const unsectioned = useMemo(
    () => visibleItems.filter((i) => i.section_id == null),
    [visibleItems],
  )

  const countFor = (tab) => {
    if (tab === 'all') return items.length
    if (tab === 'today') return dueTodayCount
    if (tab === 'commands') return items.filter((i) => i.type === 'snippet').length
    const secId = Number(tab)
    return items.filter((i) => i.section_id === secId).length
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        await importData(file)
      } catch (err) {
        showToast(`Import failed: ${err.message}`)
      }
    }
    e.target.value = ''
  }

  const openDrawer = useCallback((item) => {
    const sec = sections.find((s) => s.id === item.section_id)
    setDrawerItem({ ...item, sectionName: sec?.name || '' })
    recordOpen({
      kind: 'item',
      id: item.id,
      label: item.title,
      url: item.url || null,
      type: item.type,
      section_id: item.section_id,
    })
  }, [sections, recordOpen])

  const handleEditItem = useCallback((item) => {
    setDrawerItem(null)
    setEditingItem(item)
    setItemDefaults(null)
    setShowItemModal(true)
  }, [])

  // Add a new item with type/section prefilled (used by SnippetPanel "+ Command").
  const handleAddItem = useCallback((type, sectionId = null) => {
    setEditingItem(null)
    setItemDefaults({ type, section_id: sectionId })
    setShowItemModal(true)
  }, [])

  const handleEditSection = useCallback((section) => {
    setEditingSection(section)
    setShowSectionModal(true)
  }, [])

  const paletteSelect = useCallback(
    (item) => {
      if (item.url) {
        window.open(item.url, '_blank')
      } else if (item.type === 'todo') {
        toggleDone(item.id, !item.done)
      } else if (item.type === 'snippet') {
        if (item.body) navigator.clipboard.writeText(item.body).then(() => showToast('Copied “' + item.title + '” 📋'))
      } else if (item.section_id) {
        setActiveTab(String(item.section_id))
      }
      recordOpen({
        kind: 'item', id: item.id, label: item.title, url: item.url || null,
        type: item.type, section_id: item.section_id,
      })
      showToast(`Jumped to “${item.title}”`)
    },
    [toggleDone, showToast, recordOpen],
  )

  const openDocFromPalette = useCallback((docId) => {
    setPendingDocId(docId)
    setActiveTab('docs')
    recordOpen({ kind: 'doc', id: docId, label: 'Document' })
  }, [recordOpen])

  const selectSectionFromPalette = useCallback((tab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="app-shell">
      {/* ---------------- Top bar ---------------- */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">⛭</span>
          WorkHub
        </div>

        <button className="search-trigger" onClick={() => setShowPalette(true)}>
          <Search size={14} />
          <span>Search everything…</span>
          <kbd>⌘⇧P</kbd>
        </button>

        <div className="topbar-actions">
          <button
            className="btn btn-ghost"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="btn btn-ghost"
            title="Enable due-today notifications"
            onClick={askNotification}
          >
            <Bell size={14} />
          </button>
          <button className="btn" title="Add item (⌘⇧A)" onClick={() => { setEditingItem(null); setItemDefaults(null); setShowItemModal(true) }}>
            <Plus size={15} /> Add
          </button>
        </div>
      </header>

      {/* ---------------- Body ---------------- */}
      <div className={`dashboard ${navCollapsed ? 'nav-collapsed' : ''}`}>
        {/* Sidebar */}
        <aside className="sidebar">
          <button
            className={`sidebar-toggle ${navCollapsed ? 'closed' : ''}`}
            title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleNav}
          >
            <ChevronRight size={14} />
          </button>
          <h3>Views</h3>
          <button
            className={`side-link ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
            title="All items"
          >
            <LayoutDashboard size={15} /><span className="side-name">All items</span>
            <span className="count">{countFor('all')}</span>
          </button>
          <button
            className={`side-link ${activeTab === 'today' ? 'active' : ''}`}
            onClick={() => setActiveTab('today')}
            title="Due today"
          >
            <span style={{ color: dueTodayCount > 0 ? 'var(--amber)' : 'inherit' }}>☀️</span>
            <span className="side-name">Due today</span>
            <span className="count">{countFor('today')}</span>
          </button>

          <h3>Workspace</h3>
          <button
            className={`side-link ${activeTab === 'docs' ? 'active' : ''}`}
            onClick={() => setActiveTab('docs')}
            title="Docs"
          >
            <FileText size={15} /><span className="side-name">Docs</span>
          </button>

          <button
            className={`side-link ${activeTab === 'commands' ? 'active' : ''}`}
            onClick={() => setActiveTab('commands')}
            title="Commands"
          >
            <Terminal size={15} /><span className="side-name">Commands</span>
            <span className="count">{countFor('commands')}</span>
          </button>

          {recent.length > 0 && (
            <>
              <h3 className="recent-head">
                Recent
                <button className="recent-clear" title="Clear recent" onClick={clearRecent}>✕</button>
              </h3>
              <div className="recent-list">
                {recent.map((r) => (
                  <button
                    key={`${r.kind}-${r.id}`}
                    className="side-link recent-link"
                    title={r.label}
                    onClick={() => {
                      if (r.kind === 'doc') {
                        openDocFromPalette(r.id)
                      } else if (r.url) {
                        window.open(r.url, '_blank')
                      } else if (r.section_id) {
                        setActiveTab(String(r.section_id))
                      }
                    }}
                  >
                    <span className="recent-ico">
                      {r.kind === 'doc' ? <FileText size={13} /> : (TYPE_EMOJI[r.type] || '🔗')}
                    </span>
                    <span className="side-name">{r.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h3>Sections</h3>
          <SectionList
            activeTab={activeTab}
            onSelect={(t) => setActiveTab(t)}
            onNew={() => { setEditingSection(null); setShowSectionModal(true) }}
            countFor={countFor}
          />
        </aside>

        {/* Main */}
        <main className="main">
          {activeTab === 'docs' ? (
            <DocsView
              showToast={showToast}
              openDocId={pendingDocId}
              onDocOpened={() => setPendingDocId(null)}
            />
          ) : loading ? (
            <div className="empty"><div className="big">⏳</div>Loading WorkHub…</div>
          ) : error ? (
            <div className="empty">
              <div className="big">⚠️</div>
              {error}
              <div className="muted">Is the backend running? Try <code>make run</code>.</div>
            </div>
          ) : (
            <>
              {(activeTab === 'all' || activeTab === 'today') && (allPinned.length > 0 || dueTodayCount > 0) && (
                <div className="today-panel">
                  <span className="spark">⚡</span>
                  <span>
                    {dueTodayCount > 0 ? (
                      <>
                        <b>{dueTodayCount}</b> thing{dueTodayCount === 1 ? '' : 's'} due today
                        {allPinned.length > 0 && <> · </>}
                      </>
                    ) : null}
                    {allPinned.length > 0 && (
                      <>
                        <b>{allPinned.length}</b> pinned
                      </>
                    )}
                  </span>
                  <span className="spacer" />
                  <div className="flex">
                    {allPinned.slice(0, 4).map((p) => (
                      <span key={p.id} className="tag">{TYPE_EMOJI[p.type]} {p.title.length > 18 ? p.title.slice(0, 18) + '…' : p.title}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'all' ? (
                <>
                  {sectionsWithItems.some((s) => s.sectionItems.length > 0) && (
                    <div className="board-toolbar">
                      <span className="spacer" />
                      <button
                        className="btn btn-ghost"
                        onClick={() => collapseAllSections(collapsedSections.size === 0)}
                        title={collapsedSections.size === 0 ? 'Collapse all sections' : 'Expand all sections'}
                      >
                        {collapsedSections.size === 0 ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
                        {collapsedSections.size === 0 ? 'Collapse all' : 'Expand all'}
                      </button>
                    </div>
                  )}
                  {sectionsWithItems.map((sec) => (
                    <SectionRow
                      key={sec.id}
                      section={sec}
                      collapsed={collapsedSections.has(sec.id)}
                      onToggleCollapsed={() => toggleSectionCollapsed(sec.id)}
                      onEditSection={handleEditSection}
                      onEditItem={handleEditItem}
                      onOpenItem={openDrawer}
                      onAddItem={handleAddItem}
                    />
                  ))}
                  {unsectioned.length > 0 && (
                    <div className="section-head" style={{ marginTop: 20 }}>
                      <div className="emblem" style={{ background: 'var(--bg-elev)', color: 'var(--text-dim)' }}>🗂️</div>
                      <h2>Unsectioned</h2>
                    </div>
                  )}
                  <div className="cards">
                    {unsectioned.filter((it) => it.type !== 'snippet').map((it) => (
                      <ItemCard
                        key={it.id}
                        item={it}
                        sectionColor={null}
                        onEdit={handleEditItem}
                        onOpen={openDrawer}
                      />
                    ))}
                  </div>
                  {unsectioned.some((it) => it.type === 'snippet') && (
                    <SnippetPanel
                      items={unsectioned.filter((it) => it.type === 'snippet')}
                      onEditItem={handleEditItem}
                      onAddItem={(type) => handleAddItem(type, null)}
                    />
                  )}
                </>
              ) : activeTab === 'today' ? (
                <TodayView items={visibleItems} onEditItem={handleEditItem} onOpenItem={openDrawer} />
              ) : activeTab === 'commands' ? (
                <CommandsView
                  items={visibleItems}
                  sections={sections}
                  onEditItem={handleEditItem}
                  onAddItem={handleAddItem}
                />
              ) : (
                <SectionView
                  items={visibleItems}
                  section={sections.find((s) => s.id === Number(activeTab))}
                  onEditItem={handleEditItem}
                  onOpenItem={openDrawer}
                  onEditSection={handleEditSection}
                  onAddItem={handleAddItem}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ---------------- Settings / export bar ---------------- */}
      <div className="settings-bar">
        <button className="btn" onClick={exportData}><Download size={14} /> Export</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFile} />
        <button className="btn btn-ghost" onClick={() => { setEditingSection(null); setShowSectionModal(true) }}>
          <Settings size={14} /> Manage sections
        </button>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          Data stored locally · <code>backend/data/workhub.db</code>
        </span>
      </div>

      {/* ---------------- Modals ---------------- */}
      {showItemModal && (
        <ItemModal
          initial={editingItem}
          defaults={itemDefaults}
          clipboardUrl={clipboardUrl}
          onClose={() => { setShowItemModal(false); setEditingItem(null); setItemDefaults(null); setClipboardUrl(null) }}
        />
      )}
      {drawerItem && (
        <ItemDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onEdit={handleEditItem}
        />
      )}
      {showSectionModal && (
        <SectionModal
          initial={editingSection}
          onClose={() => { setShowSectionModal(false); setEditingSection(null) }}
        />
      )}
      {showPalette && (
        <SearchPalette
          onClose={() => setShowPalette(false)}
          onSelect={paletteSelect}
          onOpenDoc={openDocFromPalette}
          onSelectSection={selectSectionFromPalette}
        />
      )}

      {showScratch && (
        <ScratchNote onClose={() => setShowScratch(false)} />
      )}

      {quickCapture && (
        <QuickCapture
          sections={sections}
          initial={quickCapture}
          addItem={addItem}
          onSaved={(t) => showToast(`Saved “${t}” 📌`)}
          onClose={() => setQuickCapture(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ---------------- Section row (heading + cards) ----------------
function SectionRow({ section, collapsed, onToggleCollapsed, onEditSection, onEditItem, onOpenItem, onAddItem }) {
  const count = section.sectionItems.length
  const snippets = section.sectionItems.filter((i) => i.type === 'snippet')
  const others = section.sectionItems.filter((i) => i.type !== 'snippet')
  if (count === 0) return null
  return (
    <>
      <div className={`section-head ${collapsed ? 'collapsed' : ''}`}>
        <button
          className="section-toggle"
          title={collapsed ? 'Expand section' : 'Collapse section'}
          onClick={onToggleCollapsed}
        >
          <ChevronRight size={16} className={collapsed ? '' : 'rot90'} />
        </button>
        <div className="emblem" style={{ background: `${section.color}1a`, color: section.color }}>
          {section.icon}
        </div>
        <h2 onClick={onToggleCollapsed} style={{ cursor: 'pointer' }}>{section.name}</h2>
        <span className="sub">{count}</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onEditSection(section)}>
          Edit
        </button>
      </div>
      {!collapsed && others.length > 0 && (
        <div className="cards">
          {others.map((it) => (
            <ItemCard key={it.id} item={it} sectionColor={section.color} onEdit={onEditItem} onOpen={onOpenItem} />
          ))}
        </div>
      )}
      {!collapsed && snippets.length > 0 && (
        <SnippetPanel
          items={snippets}
          onEditItem={onEditItem}
          onAddItem={(type) => onAddItem?.(type, section.id)}
        />
      )}
    </>
  )
}

// ---------------- Single section view ----------------
function SectionView({ section, items, onEditItem, onOpenItem, onEditSection, onAddItem }) {
  const snippets = items.filter((i) => i.type === 'snippet')
  const rest = items.filter((i) => i.type !== 'snippet')
  const notDone = rest.filter((i) => !i.done)
  const done = rest.filter((i) => i.done)
  return (
    <>
      {section && (
        <div className="section-head">
          <div className="emblem" style={{ background: `${section.color}1a`, color: section.color }}>{section.icon}</div>
          <h2>{section.name}</h2>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => onEditSection?.(section)}>
            Edit
          </button>
        </div>
      )}
      {notDone.length === 0 && done.length === 0 && snippets.length === 0 && (
        <div className="empty"><div className="big">🌱</div>Nothing here yet. Add something with <b>⌘⇧A</b>.</div>
      )}
      {snippets.length > 0 && (
        <SnippetPanel
          items={snippets}
          onEditItem={onEditItem}
          onAddItem={(type) => onAddItem?.(type, section?.id ?? null)}
        />
      )}
      <div className="cards">
        {notDone.map((it) => <ItemCard key={it.id} item={it} onEdit={onEditItem} onOpen={onOpenItem} />)}
        {done.map((it) => <ItemCard key={it.id} item={it} onEdit={onEditItem} onOpen={onOpenItem} />)}
      </div>
    </>
  )
}

// ---------------- Quick command capture (⌘⇧S) ----------------
function QuickCapture({ sections, initial, addItem, onSaved, onClose }) {
  const [title, setTitle] = useState(initial.title || '')
  const [body, setBody] = useState(initial.body || '')
  const [sectionId, setSectionId] = useState(initial.section_id ?? null)
  const [saving, setSaving] = useState(false)
  const [copyAfter, setCopyAfter] = useState(() => localStorage.getItem('workhub.capture.copy') !== '0')
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    const text = body.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      const t = (title.trim() || text.split('\n')[0]).slice(0, 80)
      await addItem({ type: 'snippet', title: t, body: text, section_id: sectionId, tags: [] })
      if (copyAfter) navigator.clipboard.writeText(text).catch(() => {})
      setTitle('')
      setBody('')
      titleRef.current?.focus()
      onSaved(t)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal quick-capture">
        <h3>⌨️ Quick capture command</h3>
        <div className="field">
          <label>Command / commit message * </label>
          <textarea
            autoFocus
            className="mono-area"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'git rebase -i origin/main\n\nor\n\nfeat(auth): add JWT refresh flow'}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
            }}
          />
        </div>
        <div className="row-2">
          <div className="field">
            <label>Name (optional)</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="defaults to first line"
            />
          </div>
          <div className="field">
            <label>Project</label>
            <select
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <label className="flex muted" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={copyAfter}
              onChange={(e) => {
                setCopyAfter(e.target.checked)
                localStorage.setItem('workhub.capture.copy', e.target.checked ? '1' : '0')
              }}
            />
            <span>Also copy after save</span>
          </label>
          <span className="hint">⌘⏎ saves &amp; clears for the next · Esc closes</span>
          <span style={{ marginLeft: 'auto' }} />
          <button type="button" className="btn" onClick={onClose}>Done</button>
          <button type="button" className="btn btn-primary" disabled={saving || !body.trim()} onClick={save}>
            {saving ? 'Saving…' : 'Save'} ⏎
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Commands page (all snippets, grouped by section) ----------------
function CommandsView({ items, sections, onEditItem, onAddItem }) {
  const { recentCopied, clearRecentCopied, showToast, recordCopy } = useStore()
  // Per-project groups can be collapsed; the choice persists across reloads.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('workhub.commands.collapsed') || '[]'))
    } catch {
      return new Set()
    }
  })
  // One search box across every project on this page.
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matched = useMemo(() => {
    if (!q) return items
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.body || '').toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [items, q])

  const toggleCollapse = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem('workhub.commands.collapsed', JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }

  const groups = sections
    .map((sec) => ({ sec, snips: matched.filter((i) => i.section_id === sec.id), key: String(sec.id) }))
    .filter((g) => g.snips.length > 0)
  const loose = matched.filter((i) => i.section_id == null)
  if (loose.length > 0) groups.push({ sec: null, snips: loose, key: 'none' })

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  return (
    <>
      <div className="section-head">
        <div className="emblem" style={{ background: 'rgba(167,139,250,0.15)', color: 'var(--accent)' }}>⌨️</div>
        <h2>Commands</h2>
        <span className="sub">{items.length}</span>
        <div className="commands-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search all projects…"
          />
          {query && (
            <button className="icon-btn" title="Clear" onClick={() => setQuery('')}><X size={12} /></button>
          )}
        </div>
        <button
          className="btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => onAddItem('snippet', null)}
        >
          <Plus size={14} /> New command
        </button>
      </div>
      <div className="hint commands-hint">
        click a row to copy · ⇧-click or <kbd>Space</kbd> multi-select · <kbd>↑↓</kbd> navigate · <kbd>/</kbd> filter
      </div>
      {recentCopied.length > 0 && (
        <div className="copied-strip">
          <span className="copied-strip-label">Recently copied</span>
          {recentCopied.map((r) => {
            const item = byId.get(r.id)
            return (
              <button
                key={r.id}
                className="chip"
                title={item ? 'Click to copy again' : 'Deleted'}
                disabled={!item}
                onClick={() => {
                  if (!item?.body) return
                  navigator.clipboard.writeText(item.body).then(() => {
                    recordCopy({ id: item.id, label: item.title })
                    showToast(`Copied “${item.title}” 📋`)
                  })
                }}
              >
                <Copy size={11} /> {r.label.length > 22 ? r.label.slice(0, 22) + '…' : r.label}
              </button>
            )
          })}
          <button className="recent-clear" title="Clear" onClick={clearRecentCopied}>✕</button>
        </div>
      )}
      {items.length === 0 && (
        <div className="empty">
          <div className="big">⌨️</div>
          No commands yet. Add commit messages or one-liners with <b>+ New command</b> —
          then copy them anywhere with one click.
        </div>
      )}
      {groups.map(({ sec, snips, key }) => {
        const isCollapsed = collapsed.has(key)
        return (
          <div key={key}>
            <div className="section-head" style={{ marginTop: 18 }}>
              <button
                className={`emblem collapse-toggle ${isCollapsed ? 'closed' : ''}`}
                style={{ background: `${sec?.color || '#888'}1a`, color: sec?.color || 'var(--text-dim)' }}
                title={isCollapsed ? 'Expand' : 'Collapse'}
                onClick={() => toggleCollapse(key)}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
              <div className="emblem" style={{ background: `${sec?.color || '#888'}1a`, color: sec?.color || 'var(--text-dim)' }}>
                {sec?.icon || '🗂️'}
              </div>
              <h2
                style={{ fontSize: 15, cursor: 'pointer' }}
                title={isCollapsed ? 'Expand' : 'Collapse'}
                onClick={() => toggleCollapse(key)}
              >
                {sec?.name || 'Unsectioned'}
              </h2>
              <span className="sub">{snips.length}</span>
              {isCollapsed && (
                <span className="muted commands-preview">
                  {snips.slice(0, 3).map((s) => s.title).join(' · ')}
                  {snips.length > 3 ? ` · +${snips.length - 3}` : ''}
                </span>
              )}
              <button
                className="btn btn-ghost"
                style={{ marginLeft: 'auto' }}
                onClick={() => onAddItem('snippet', sec?.id ?? null)}
              >
                <Plus size={13} /> Command
              </button>
            </div>
            {!isCollapsed && (
              <SnippetPanel items={snips} onEditItem={onEditItem} onAddItem={(t) => onAddItem(t, sec?.id ?? null)} />
            )}
          </div>
        )
      })}
    </>
  )
}

// ---------------- Due-today view ----------------
function TodayView({ items, onEditItem, onOpenItem }) {
  const dueTodos = items.filter((i) => i.type === 'todo' && isToday(i.due_date))
  const pinned = items.filter((i) => i.pinned)
  const others = items.filter((i) => !(isToday(i.due_date)) && !i.pinned)

  return (
    <>
      <div className="section-head">
        <div className="emblem" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>☀️</div>
        <h2>Due today</h2>
      </div>
      {dueTodos.length === 0 && <div className="empty"><div className="big">🎉</div>Nothing due today — clear desk!</div>}
      <div className="cards">
        {dueTodos.map((it) => <ItemCard key={it.id} item={it} onEdit={onEditItem} onOpen={onOpenItem} />)}
      </div>

      {pinned.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}>
            <div className="emblem" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>⭐</div>
            <h2>Pinned</h2>
          </div>
          <div className="cards">
            {pinned.map((it) => <ItemCard key={it.id} item={it} onEdit={onEditItem} onOpen={onOpenItem} />)}
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}>
            <div className="emblem" style={{ background: 'var(--bg-elev)', color: 'var(--text-dim)' }}>🗒️</div>
            <h2>Everything else</h2>
          </div>
          <div className="cards">
            {others.map((it) => <ItemCard key={it.id} item={it} onEdit={onEditItem} onOpen={onOpenItem} />)}
          </div>
        </>
      )}
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
