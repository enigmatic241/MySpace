import React from 'react'
import MermaidBlock from './MermaidBlock'

/**
 * Custom renderers for ReactMarkdown that add Mermaid support.
 *
 * Usage:
 *   <ReactMarkdown components={{ code: CodeBlock, pre: PreBlock }}>...
 *
 * - `CodeBlock` handles inline `code` (and block code *content* only).
 * - `PreBlock` handles block `<pre>` wrappers; detects ```mermaid and renders
 *   a real diagram, otherwise renders a styled code block.
 * Splitting `pre` + `code` avoids "pre cannot appear as descendant of p" and
 * double `<pre><pre>` nesting from react-markdown.
 *
 * react-markdown v10 passes `node` (the hast element) to every component (via
 * `passNode`), and does NOT pass an `inline` boolean. So:
 *   - we must NOT spread `node` onto the DOM element (it would render the bogus
 *     `node="[object Object]"` attribute), and
 *   - we distinguish inline vs block code via the `language-*` class that
 *     react-markdown sets on language-tagged fences (the same approach as the
 *     official react-markdown README); block `pre` wrappers are handled by
 *     PreBlock, which also detects `mermaid`.
 */

export function CodeBlock({ className = '', children, node: _node, ...rest }) {
  // react-markdown v10 sets the `language-*` class on block code from a
  // language-tagged fence. Inline code (and untagged fences) have no such
  // class. Untagged fences are still wrapped in <pre> by PreBlock, whose CSS
  // (`pre.code-block code`) neutralizes the chip look below, so the class here
  // is cosmetic only — the block styling comes from PreBlock + styles.css.
  const match = /language-(\w+)/.exec(className || '')
  if (!match) {
    return <code className="inline-code" {...rest}>{children}</code>
  }
  // Block code content only — the wrapper <pre> is rendered by PreBlock.
  return <code className={className} {...rest}>{children}</code>
}

export function PreBlock({ children, theme = 'dark' }) {
  // The first child is the <code> element rendered by CodeBlock.
  const child = Array.isArray(children) ? children[0] : children
  const childProps = child && typeof child === 'object' ? child.props || {} : {}
  const codeChildren = childProps.children ?? children

  // Flatten nested arrays/React nodes to a plain string.
  const flat = []
  const flatten = (node) => {
    if (node == null) return
    if (Array.isArray(node)) return node.forEach(flatten)
    if (typeof node === 'object' && node.props) return flatten(node.props.children)
    flat.push(String(node))
  }
  flatten(codeChildren)
  const codeText = flat.join('').replace(/\n$/, '')

  const className = childProps.className || ''
  const match = /language-(\w+)/.exec(className)
  const language = match ? match[1] : null

  if (language === 'mermaid') {
    return <MermaidBlock code={codeText} theme={theme} />
  }

  return (
    <pre className={`code-block ${language ? `language-${language}` : ''}`}>
      {language && <div className="code-lang">{language}</div>}
      {children}
    </pre>
  )
}

