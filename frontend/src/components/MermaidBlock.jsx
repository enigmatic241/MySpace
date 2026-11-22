import React, { useEffect, useRef, useState } from 'react'

/**
 * Renders a ```mermaid code fence as an SVG diagram using the Mermaid library.
 * Shows the raw source text as a fallback if rendering fails.
 * `theme` can be 'dark' (default) or 'light' to match app theme.
 */
export default function MermaidBlock({ code, theme = 'dark' }) {
  const ref = useRef(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function render() {
      try {
        // Dynamic import keeps the initial bundle light (mermaid is large).
        const mermaid = (await import('mermaid')).default
        const isLight = theme === 'light'
        mermaid.initialize({
          startOnLoad: false,
          theme: isLight ? 'neutral' : 'dark',
          securityLevel: 'loose',
          fontFamily: 'var(--font)',
          themeVariables: {
            background: 'transparent',
            primaryColor: isLight ? '#ffffff' : '#131a22',
            primaryBorderColor: '#22d3ee',
            primaryTextColor: isLight ? '#0f172a' : '#e6edf3',
            secondaryColor: isLight ? '#f1f5f9' : '#182130',
            lineColor: isLight ? '#475569' : '#9aa7b4',
          },
        })
        if (cancelled || !ref.current) return
        const { svg } = await mermaid.render(idRef.current, code)
        if (cancelled || !ref.current) return
        const container = ref.current
        container.innerHTML = svg
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    render()
    return () => {
      cancelled = true
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [code, theme])

  return (
    <div className="mermaid-block">
      {loading && <div className="mermaid-loading">Rendering diagram…</div>}
      {error ? (
        <div className="mermaid-error">
          <div className="mermaid-error-title">⚠️ Could not render diagram</div>
          <pre>{code}</pre>
          <div className="mermaid-error-msg muted">{error}</div>
        </div>
      ) : (
        <div ref={ref} className="mermaid-svg" />
      )}
    </div>
  )
}
