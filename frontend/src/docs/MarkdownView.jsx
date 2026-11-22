import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock, PreBlock } from '../components/CodeBlock'

/**
 * Shared markdown renderer used by both the item drawer and the Docs viewer,
 * so mermaid tables checklists etc. render identically everywhere.
 * `theme` (dark|light) is forwarded to mermaid diagrams.
 */
export default function MarkdownView({ children, className = '', theme = 'dark' }) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          pre: (props) => <PreBlock {...props} theme={theme} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
