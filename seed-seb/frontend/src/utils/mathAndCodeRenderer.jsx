import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import DOMPurify from 'dompurify';

/**
 * Safely renders LaTeX mathematical expressions and code blocks in question & option text.
 * Handles \frac{a}{b}, \sqrt{x}, \pm, \times, \div, exponents (^), subscripts (_),
 * markdown code blocks (```...```), and preserves multi-line whitespace.
 */
export const renderMathAndCode = (text, isOption = false) => {
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') return String(text);

  const str = String(text);
  if (!str.trim()) return '';

  // 1. Check for markdown code blocks (```code```)
  if (str.includes('```')) {
    const parts = str.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        let code = part.slice(3, -3);
        const firstLineBreak = code.indexOf('\n');
        if (firstLineBreak !== -1) {
          const possibleLang = code.substring(0, firstLineBreak).trim();
          if (/^[a-zA-Z0-9_+-]+$/.test(possibleLang)) {
            code = code.substring(firstLineBreak + 1);
          }
        }
        return (
          <pre
            key={index}
            className="mcq-code-snippet"
            style={{
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#0f172a',
              color: '#38bdf8',
              padding: '12px 16px',
              borderRadius: '8px',
              margin: '10px 0',
              fontSize: '0.9rem',
              lineHeight: '1.6',
              border: '1px solid #334155',
              overflowX: 'auto'
            }}
          >
            <code>{code.trim()}</code>
          </pre>
        );
      }
      return <span key={index}>{renderMathAndCode(part, isOption)}</span>;
    });
  }

  // 2. Check for LaTeX math commands or delimiters ($...$, \frac, \sqrt, \pm, etc.)
  const hasLatexCmds = /\\(frac|dfrac|sqrt|pm|mp|times|div|le|ge|neq|approx|pi|alpha|beta|theta|lambda|infty|sum|int|lim)|\$|\\[\(\[\)\]]|\^|_/.test(str);

  if (hasLatexCmds) {
    try {
      if (str.includes('$')) {
        // Handle $ inline math $ or $$ display math $$
        const parts = str.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
        return parts.map((part, index) => {
          if (part.startsWith('$$') && part.endsWith('$$')) {
            const math = part.slice(2, -2).trim();
            const html = DOMPurify.sanitize(katex.renderToString(math, { displayMode: true, throwOnError: false }));
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } else if (part.startsWith('$') && part.endsWith('$')) {
            const math = part.slice(1, -1).trim();
            const html = DOMPurify.sanitize(katex.renderToString(math, { displayMode: false, throwOnError: false }));
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          }
          return (
            <span
              key={index}
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                lineHeight: '1.6'
              }}
            >
              {part}
            </span>
          );
        });
      } else {
        // Direct LaTeX string (e.g. \frac{15}{4} or \pm \sqrt{30})
        const html = DOMPurify.sanitize(katex.renderToString(str, { displayMode: false, throwOnError: false }));
        return (
          <span
            style={{
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              display: 'inline-block'
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
    } catch (e) {
      console.warn('[MathRenderer] KaTeX render fallback:', e);
    }
  }

  // 3. Fallback to pre-wrap string with monospace if code keywords or indents exist
  const looksLikeCode = isOption && (str.includes('\n') || str.includes(';') || str.includes('{') || str.includes('}') || str.includes('()'));

  return (
    <span
      style={{
        whiteSpace: 'pre-wrap',
        fontFamily: looksLikeCode ? 'Consolas, Monaco, "Courier New", monospace' : 'inherit',
        lineHeight: '1.6',
        wordBreak: 'break-word'
      }}
    >
      {str}
    </span>
  );
};

export default renderMathAndCode;
