import { describe, expect, it } from 'vitest'
import { splitStream } from '@/components/MarkdownPreview/transform'

describe('splitStream', () => {
  it('processes SSE formatted data', async () => {
    const stream = splitStream('\n\n')
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    const chunks: string[] = []

    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    })()

    await writer.write('data: {"text":"hello"}\n\n')
    await writer.close()
    await readPromise

    expect(chunks.length).toBeGreaterThan(0)
  })

  it('handles plain text chunks', async () => {
    const stream = splitStream('\n')
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    const chunks: string[] = []

    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    })()

    await writer.write('hello world')
    await writer.close()
    await readPromise

    expect(chunks.join('')).toContain('hello')
  })
})
