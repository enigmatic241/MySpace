// PDF export for docs.
//
// Strategy: render the doc in-process into a hidden host element (so React and
// Mermaid run in the app's own module context), wait for Mermaid to produce its
// inline SVG, then open a clean print window containing just that rendered HTML
// and trigger the browser's "Save as PDF" printer.
//
// Mermaid always renders with the light theme here so the diagrams have dark
// text on transparent background — legible on white paper regardless of the
// app's current theme. This avoids jsPDF/html2canvas entirely: they rasterize
// the page and break Mermaid because it uses HTML <foreignObject> labels that
// html2canvas cannot capture.

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import MarkdownView from './MarkdownView'

let hostSeq = 0

// Count of ```mermaid fences in a markdown source string.
function countMermaidFences(md) {
  const m = md.match(/```mermaid[\s\S]*?(```|$)/g)
  if (!m) return 0
  // A trailing unterminated fence is still rendered as a diagram.
  return m.filter((block) => /```mermaid/.test(block)).length
}

// Resolve once every mermaid fence finished rendering (svg or error) or the
// timeout elapses.
function waitForMermaid(host, expected) {
  return new Promise((resolve) => {
    if (expected === 0) return resolve(false)
    const startedAt = Date.now()
    const tick = () => {
      const ok = host.querySelectorAll('.mermaid-svg svg').length
      const err = host.querySelectorAll('.mermaid-error').length
      if (ok + err >= expected) return resolve(false)
      if (Date.now() - startedAt > 20000) return resolve(true)
      setTimeout(tick, 100)
    }
    tick()
  })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Wait until every <img> in the print window has finished loading before
// printing (otherwise remote images can come out blank). Falls back after 3s.
function printWhenReady(win) {
  const imgs = Array.from(win.document.images)
  if (imgs.length === 0) return win.print()
  let loaded = 0
  let fired = false
  const fire = () => { if (!fired) { fired = true; win.print() } }
  const count = () => { loaded += 1; if (loaded >= imgs.length) fire() }
  imgs.forEach((img) => {
    if (img.complete) count()
    else {
      img.addEventListener('load', count)
      img.addEventListener('error', count)
    }
  })
  win.setTimeout(fire, 3000) // safety fallback
}

export function downloadDocAsPDF({ doc, theme = 'dark' }) {
  if (!doc) return
  const md = String(doc.content || '')

  // 1. Render into a hidden host inside the app (same bundle -> Mermaid works).
  const host = document.createElement('div')
  host.id = `workhub-pdf-render-${++hostSeq}`
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;pointer-events:none;opacity:0;'
  document.body.appendChild(host)

  const root = createRoot(host)
  const cleanup = () => {
    try { root.unmount() } catch { /* already unmounted */ }
    host.remove()
  }

  let html
  try {
    // Force synchronous commit so `host.innerHTML` is populated before we
    // snapshot it (async render would leave it empty for docs without mermaid).
    flushSync(() => root.render(<MarkdownView theme="light">{md}</MarkdownView>))
    html = host.innerHTML
  } catch (err) {
    cleanup()
    // eslint-disable-next-line no-alert
    alert(`WorkHub: could not render the document for PDF: ${err?.message || err}`)
    return
  }

  const title = escapeHtml(doc.title || 'Untitled document')
  const updated = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : ''
  const bodyClass = theme === 'light' ? ' theme-light' : ''

  // 2. Open the print window SYNCHRONOUSLY, inside the click handler, so the
  //    popup is treated as user-initiated and not blocked by the browser.
  //    Leave it on about:blank and fill it exactly once below — re-opening an
  //    already-loaded document is unreliable in some browsers.
  const win = window.open('about:blank', '_blank')
  if (!win) {
    cleanup()
    // eslint-disable-next-line no-alert
    alert('WorkHub: popups are blocked. Allow popups for this app, then try Download PDF again.')
    return
  }

  waitForMermaid(host, countMermaidFences(md)).then(() => {
    html = host.innerHTML
    cleanup()
    if (win.closed) return

    win.document.open()
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WorkHub — ${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  .workhub-pdf-doc,
  .workhub-pdf-doc .markdown-body {
    font-family: -apple-system, 'Inter', 'Segoe UI', BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #111 !important;
    max-width: 780px;
    margin: 0 auto;
    background: #fff !important;
  }
  .workhub-pdf-doc { padding: 4px 2px; }
  .workhub-pdf-doc-title { font-size: 26px; font-weight: 700; margin: 0 0 4px; color: #0b0f14; }
  .workhub-pdf-doc-meta { font-size: 11px; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 20px; }
  .workhub-pdf-doc h1, .workhub-pdf-doc h2, .workhub-pdf-doc h3, .workhub-pdf-doc h4 {
    color: #0b0f14 !important; line-height: 1.3; margin: 1.2em 0 0.5em; page-break-after: avoid;
  }
  .workhub-pdf-doc h1 { font-size: 22px; } .workhub-pdf-doc h2 { font-size: 18px; } .workhub-pdf-doc h3 { font-size: 15px; }
  .workhub-pdf-doc p { margin: 0.6em 0; }
  .workhub-pdf-doc a { color: #0891b2; text-decoration: none; }
  .workhub-pdf-doc pre, .workhub-pdf-doc table, .workhub-pdf-doc .mermaid-block, .workhub-pdf-doc blockquote, .workhub-pdf-doc figure {
    page-break-inside: avoid; break-inside: avoid;
  }
  .workhub-pdf-doc pre {
    background: #f6f8fa; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 12px; overflow: hidden; white-space: pre-wrap; word-break: break-word;
    font-size: 12px; color: #1f2937 !important;
  }
  .workhub-pdf-doc code { font-family: 'SF Mono', Menlo, Consolas, monospace; }
  .workhub-pdf-doc :not(pre) > code {
    background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px;
    padding: 1px 5px; font-size: 12px; color: #111 !important;
  }
  .workhub-pdf-doc table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
  .workhub-pdf-doc th, .workhub-pdf-doc td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; color: #111 !important; }
  .workhub-pdf-doc th { background: #f6f8fa; font-weight: 600; }
  .workhub-pdf-doc blockquote { border-left: 3px solid #d1d5db; margin: 12px 0; padding: 2px 14px; color: #4b5563; }
  .workhub-pdf-doc img { max-width: 100%; height: auto; }
  .workhub-pdf-doc hr { border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .workhub-pdf-doc ul, .workhub-pdf-doc ol { padding-left: 22px; }
  .workhub-pdf-doc li { margin: 2px 0; }
  .workhub-pdf-doc .code-lang { display: none; }
  .workhub-pdf-doc .mermaid-block {
    background: #fff !important; border: none !important; padding: 6px 0;
    overflow: hidden; margin: 10px 0;
  }
  .workhub-pdf-doc .mermaid-svg { display: flex; justify-content: center; }
  .workhub-pdf-doc .mermaid-svg svg { max-width: 100% !important; height: auto; }
  .workhub-pdf-doc .mermaid-loading, .workhub-pdf-doc .mermaid-error { display: none; }
  .pdf-print-note { font-size: 11px; color: #9ca3af; margin-top: 28px; border-top: 1px solid #f3f4f6; padding-top: 10px; }
</style>
</head>
<body class="workhub-pdf-body${bodyClass}">
  <div class="workhub-pdf-doc">
    <div class="workhub-pdf-doc-title">${title}</div>
    <div class="workhub-pdf-doc-meta">WorkHub document${updated ? ` · ${updated}` : ''}</div>
    ${html}
    <div class="pdf-print-note">Generated by WorkHub</div>
  </div>
</body>
</html>`)
    win.document.close()
    win.focus()
    printWhenReady(win)
  })
}
