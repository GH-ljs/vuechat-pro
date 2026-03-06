import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
// 直接强制引入 legacy 版本的 worker
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker'

// 实例化本地 Worker，并伪装成 src 路径交给 PDF.js
const worker = new PdfWorker()
pdfjsLib.GlobalWorkerOptions.workerPort = worker

import mammoth from 'mammoth'
const MAX_CHARS = 50000

globalThis.onmessage = async (e: MessageEvent) => {
  // 注意：这里的入参从 file 改成了 arrayBuffer，由主线程提前转好
  const { arrayBuffer, fileName, fileType, type } = e.data

  if (type === 'PARSE_DOC') {
    try {
      let fullText = ''

      // ==================
      // 1. TXT 纯文本解析
      // ==================
      if (fileType === 'txt') {
        const textDecoder = new TextDecoder('utf-8')
        fullText = textDecoder.decode(arrayBuffer)
      }
      // ==================
      // 2. PDF 解析
      // ==================
      else if (fileType === 'pdf') {
        // 使用 Uint8Array 包装以兼容旧版 pdfjs
        const data = new Uint8Array(arrayBuffer)
        const loadingTask = pdfjsLib.getDocument({
          data
        })
        const pdf = await loadingTask.promise
        const maxPages = pdf.numPages

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          if (fullText.length > MAX_CHARS) break
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          const pageText = textContent.items.map((item: any) => item.str).join(' ')
          fullText += `\n--- 第 ${ pageNum } 页 ---\n${ pageText }`
        }
      }
      // ==================
      // 3. Word (.docx) 解析
      // ==================
      else if (fileType === 'word') {
        const result = await mammoth.extractRawText({
          arrayBuffer
        })
        fullText = result.value
      }
      else {
        throw new Error('不支持的文件格式类型')
      }

      // 截断控制
      if (fullText.length > MAX_CHARS) {
        fullText = `${ fullText.substring(0, MAX_CHARS) }\n\n[...因文档过长，为保护性能后续内容已被截断...]`
      }

      globalThis.postMessage({
        status: 'success',
        text: fullText,
        fileName,
        fileType
      })

    } catch (error: any) {
      console.error('Worker 内解析报错详情:', error)
      globalThis.postMessage({
        status: 'error',
        // 捕获真实报错信息，防止返回 undefined
        error: error?.message || error?.name || JSON.stringify(error) || 'PDF 解析引擎遇到未知错误'
      })
    }
  }
}
