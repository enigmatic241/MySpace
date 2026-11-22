import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import MarkdownView from './MarkdownView'
import { downloadDocAsPDF } from './pdf.jsx'
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, ListChecks, Quote, Minus, Link2, Link2Off, Unlink,
  Table as TableIcon, Image as ImageIcon, Undo2, Redo2,
  Columns2, Eye, EyeOff, FileText, Moon, Sun, Maximize2, Minimize2, Trash2, Copy, X, FileDown,
} from 'lucide-react'

const TEXT_TOOLS = [
  { icon: <Pilcrow size={14} />, title: 'Paragraph', run: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive('paragraph') },
  { icon: <Heading1 size={14} />, title: 'Heading 1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
  { icon: <Heading2 size={14} />, title: 'Heading 2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
  { icon: <Heading3 size={14} />, title: 'Heading 3', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  { sep: true },
  { icon: <Bold size={14} />, title: 'Bold (⌘B)', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { icon: <Italic size={14} />, title: 'Italic (⌘I)', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { icon: <Strikethrough size={14} />, title: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
  { icon: <Code size={14} />, title: 'Inline code', run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive('code') },
]

const BLOCK_TOOLS = [
  { icon: <List size={14} />, title: 'Bullet list', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { icon: <ListOrdered size={14} />, title: 'Numbered list', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { icon: <ListChecks size={14} />, title: 'Task list', run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive('taskList') },
  { icon: <Quote size={14} />, title: 'Quote', run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
  { sep: true },
  { icon: <Code size={14} />, title: 'Code block', run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive('codeBlock') },
  { icon: <Minus size={14} />, title: 'Divider', run: (e) => e.chain().focus().setHorizontalRule().run(), active: () => false },
  { icon: <TableIcon size={14} />, title: 'Insert table', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: (e) => e.isActive('table') },
  { icon: <ImageIcon size={14} />, title: 'Insert image URL', run: insertImage, active: () => false },
]

function insertImage(editor) {
  // eslint-disable-next-line no-alert
  const url = window.prompt('Image URL (https://…)')
  if (url) editor.chain().focus().setImage({ src: url.trim() }).run()
}

// Markdown shortcut for task lists: "[] " or "[ ] " or "- [ ] " at line start.
const TaskInputRule = Extension.create({
  name: 'taskInputRule',
  addInputRules() {
    return [
      new InputRule({
        find: /^(\[\s?\])\s$/,
        handler: ({ chain, range }) => chain().deleteRange(range).toggleTaskList().run(),
      }),
      new InputRule({
        find: /^-\s\[\s?\]\s$/,
        handler: ({ chain, range }) => chain().deleteRange(range).toggleTaskList().run(),
      }),
    ]
  },
})

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Placeholder.configure({ placeholder: 'Start writing… Markdown shortcuts work: # heading, - list, 1. list, [] task, > quote, ``` code, --- divider' }),
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noreferrer' } }),
  Image.configure({ HTMLAttributes: { class: 'doc-image' } }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  TaskInputRule,
  Markdown.configure({ html: false, tightTypes: ['ul', 'ol', 'li'] }),
]

function ToolbarButton({ tool, editor }) {
  if (tool.sep) return <span className="tb-sep" />
  return (
    <button
      type="button"
      className={`tb-btn ${tool.active(editor) ? 'active' : ''}`}
      title={tool.title}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={() => tool.run(editor)}
    >
      {tool.icon}
    </button>
  )
}

/**
 * Confluence-style rich editor over TipTap (ProseMirror).
 * Markdown stays the storage format (tiptap-markdown round-trips it), so the
 * MD source view, exports and search keep working exactly as before.
 */
export default function DocEditor({
  doc,
  theme,
  onTheme,
  onChange,
  onDelete,
  onDuplicate,
  viewMode,
  onViewMode,
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [sourceDraft, setSourceDraft] = useState('')
  const docIdRef = useRef(doc.id)
  const formatRef = useRef(doc.format)
  const mode = viewMode || 'split'
  // Markdown is the storage format for rich docs; 'txt' docs load as plain text.
  const ctFor = (d) => (d.format === 'txt' ? 'text' : 'markdown')

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: doc.content || '',
    contentType: ctFor(doc),
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.storage.markdown.getMarkdown(), 'content')
    },
  })

  // Preview markdown — refreshed on every editor update; rendered with the
  // shared MarkdownView so mermaid/code-block/tables match docs everywhere else.
  const [previewMD, setPreviewMD] = useState('')

  // Read the live markdown out of the editor (tiptap-markdown) — single source
  // of truth for both the preview pane and the open MD-source view.
  const syncViews = useCallback(() => {
    if (!editor) return
    const md = editor.storage.markdown?.getMarkdown() ?? ''
    setPreviewMD(md)
    if (showSource) setSourceDraft(md)
  }, [editor, showSource])

  // Load content when the selected doc changes (tabs switch without remount).
  useEffect(() => {
    if (!editor) return
    if (docIdRef.current !== doc.id || formatRef.current !== doc.format) {
      docIdRef.current = doc.id
      formatRef.current = doc.format
      editor.commands.setContent(doc.content || '', false, { contentType: ctFor(doc) })
      // setContent(..., false) suppresses the editor 'update' event, so the
      // preview/source would otherwise keep showing the previous doc.
      syncViews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc.id, doc.format])

  // Keep the MD source view in sync while open.
  useEffect(() => {
    if (!editor || !showSource) return undefined
    const sync = () => setSourceDraft(editor.storage.markdown.getMarkdown())
    sync()
    editor.on('update', sync)
    return () => editor.off('update', sync)
  }, [editor, showSource])

  // Esc closes fullscreen.
  useEffect(() => {
    if (!fullscreen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    if (!editor) return undefined
    syncViews()
    editor.on('update', syncViews)
    return () => editor.off('update', syncViews)
  }, [editor, syncViews])

  const applySource = (value) => {
    setSourceDraft(value)
    if (editor) editor.commands.setContent(value, false, { contentType: 'markdown' })
    // setContent(..., false) suppresses the 'update' event — push the new
    // markdown into the preview pane explicitly.
    syncViews()
    onChange(value, 'content')
  }

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    // eslint-disable-next-line no-alert
    const url = window.prompt('Link URL', prev || 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const downloadPDF = () => {
    // Use the live markdown snapped from the editor (same source the preview
    // pane shows) so unsaved edits are included, then let the print dialog's
    // "Save as PDF" destination download the file.
    const md = editor?.storage.markdown?.getMarkdown() ?? previewMD
    downloadDocAsPDF({ doc: { ...doc, content: md }, theme })
  }

  return (
    <div className={`doc-editor rich ${fullscreen ? 'fullscreen' : ''} theme-${theme} mode-${mode}`}>
      <div className="doc-toolbar doc-toolbar-top">
        <input
          className="doc-title-input"
          value={doc.title}
          onChange={(e) => onChange(e.target.value, 'title')}
          placeholder="Untitled document"
        />
        <div className="doc-tools">
          <button className={`btn btn-ghost ${mode === 'edit' ? 'active' : ''}`} onClick={() => onViewMode?.('edit')} title="Editor only">
            <FileText size={14} />
          </button>
          <button className={`btn btn-ghost ${mode === 'split' ? 'active' : ''}`} onClick={() => onViewMode?.('split')} title="Editor + preview">
            <Columns2 size={14} />
          </button>
          <button className={`btn btn-ghost ${mode === 'preview' ? 'active' : ''}`} onClick={() => onViewMode?.('preview')} title="Preview only">
            <Eye size={14} />
          </button>
          <div className="view-mode-sep" />
          <button className={`btn btn-ghost ${showSource ? 'active' : ''}`} onClick={() => setShowSource((s) => !s)} title="Markdown source">
            {showSource ? <EyeOff size={14} /> : <Code size={14} />} MD
          </button>
          <button className="btn btn-ghost" onClick={onTheme} title="Toggle theme">
            {theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="btn btn-ghost" onClick={() => setFullscreen((f) => !f)} title={fullscreen ? 'Restore (esc)' : 'Fullscreen'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="btn btn-ghost" onClick={onDuplicate} title="Duplicate">
            <Copy size={14} />
          </button>
          <button className="btn btn-ghost" onClick={downloadPDF} title="Download as PDF (print-to-save)">
            <FileDown size={14} />
          </button>
          <button className="btn btn-ghost danger" onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {mode !== 'preview' && !showSource && editor && (
        <div className="doc-toolbar rich-toolbar">
          <ToolbarButton tool={TEXT_TOOLS[0]} editor={editor} />
          {TEXT_TOOLS.slice(1).map((t, i) => <ToolbarButton key={i} tool={t} editor={editor} />)}
          <span className="tb-sep" />
          {BLOCK_TOOLS.map((t, i) => <ToolbarButton key={`b${i}`} tool={t} editor={editor} />)}
          <span className="tb-sep" />
          <button
            type="button"
            className={`tb-btn ${editor.isActive('link') ? 'active' : ''}`}
            title={editor.isActive('link') ? 'Edit link' : 'Insert link'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={setLink}
          >
            <Link2 size={14} />
          </button>
          {editor.isActive('link') && (
            <button
              type="button"
              className="tb-btn"
              title="Remove link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetLink().run()}
            >
              <Unlink size={14} />
            </button>
          )}
          <span className="tb-sep" />
          <button type="button" className="tb-btn" title="Undo (⌘Z)" disabled={!editor.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={14} />
          </button>
          <button type="button" className="tb-btn" title="Redo (⇧⌘Z)" disabled={!editor.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={14} />
          </button>
        </div>
      )}

      <div className="doc-body">
        {mode !== 'preview' && (
          <div className="doc-pane doc-source">
            {showSource ? (
              <textarea
                className="doc-textarea"
                value={sourceDraft}
                onChange={(e) => applySource(e.target.value)}
                placeholder="Markdown source…"
                spellCheck="false"
              />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
        )}
        {mode !== 'edit' && (
          <div className="doc-pane doc-preview">
            {/* Rendered from the live editor content via the shared renderer. */}
            <MarkdownView theme={theme}>{previewMD}</MarkdownView>
          </div>
        )}
      </div>
    </div>
  )
}
