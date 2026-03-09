import { describe, expect, it } from 'vitest'
import { renderMarkdownText } from '@/components/MarkdownPreview/plugins/markdown'

describe('renderMarkdownText', () => {
  it('renders basic markdown to HTML', () => {
    const result = renderMarkdownText('**bold**')
    expect(result).toContain('<strong>bold</strong>')
  })

  it('strips script tags (XSS prevention)', () => {
    const result = renderMarkdownText('<script>alert("xss")</script>')
    // html:false escapes tags via entities — no executable <script> in output
    expect(result).not.toMatch(/<script[\s>]/)
  })

  it('strips iframe tags', () => {
    const result = renderMarkdownText('<iframe src="https://evil.com"></iframe>')
    expect(result).not.toContain('<iframe')
  })

  it('strips event handler attributes', () => {
    const result = renderMarkdownText('<img src=x onerror="alert(1)">')
    // html:false turns it into escaped text; no real <img> with onerror
    expect(result).not.toMatch(/<img[^>]+onerror/)
  })

  it('strips object/embed tags', () => {
    const malicious = '<object data="evil.swf"></object><embed src="evil.swf">'
    const result = renderMarkdownText(malicious)
    expect(result).not.toContain('<object')
    expect(result).not.toContain('<embed')
  })

  it('renders code blocks with highlighting', () => {
    const result = renderMarkdownText('```js\nconst x = 1\n```')
    expect(result).toContain('<code')
  })

  it('handles empty string', () => {
    const result = renderMarkdownText('')
    expect(typeof result).toBe('string')
  })

  it('renders KaTeX math with $$ delimiters', () => {
    const result = renderMarkdownText('$$E = mc^2$$')
    // KaTeX should produce some form of math rendering
    expect(result).toContain('katex')
  })

  it('handles think blocks', () => {
    const result = renderMarkdownText('<think>reasoning here</think>')
    expect(result).toContain('think-wrapper')
  })
})
