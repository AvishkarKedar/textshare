/**
 * In-browser Word (.docx) Document Parser & Viewer
 * 
 * Extracts word/document.xml using browser-native DecompressionStream and converts
 * paragraphs, headings, bold/italic runs, code spans, and tables into clean HTML
 * for side-by-side assignment viewing on college lab computers.
 */

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Extracts word/document.xml from a .docx ArrayBuffer in pure JS.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<string>} XML text
 */
export async function extractDocxXml(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const uint8 = new Uint8Array(arrayBuffer)
  let offset = 0
  const decoder = new TextDecoder('utf-8')

  while (offset < arrayBuffer.byteLength - 30) {
    const sig = view.getUint32(offset, true)
    if (sig !== 0x04034b50) break

    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)

    const nameBytes = uint8.subarray(offset + 30, offset + 30 + nameLen)
    const fileName = decoder.decode(nameBytes)
    const dataOffset = offset + 30 + nameLen + extraLen

    if (fileName === 'word/document.xml') {
      const chunk = uint8.subarray(dataOffset, dataOffset + compSize)
      if (method === 0) {
        return decoder.decode(chunk)
      } else if (method === 8) {
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw')
          const stream = new Response(chunk).body.pipeThrough(ds)
          const decompressed = await new Response(stream).arrayBuffer()
          return decoder.decode(decompressed)
        }
      }
    }

    offset = dataOffset + compSize
  }

  // Fallback: search for <w:document string if zip table had unusual offsets
  const textChunk = decoder.decode(uint8.subarray(0, Math.min(uint8.length, 500000)))
  if (textChunk.includes('<w:document')) {
    const start = textChunk.indexOf('<w:document')
    const end = textChunk.indexOf('</w:document>')
    if (start !== -1 && end !== -1) {
      return textChunk.slice(start, end + 13)
    }
  }

  throw new Error('Could not locate or decompress word/document.xml in this .docx file')
}

/**
 * Converts word/document.xml content into styled HTML.
 * @param {string} xmlString
 * @returns {string} HTML
 */
export function parseDocxXmlToHtml(xmlString) {
  if (!xmlString) return '<div class="docx-empty">No document content found.</div>'

  if (typeof DOMParser === 'undefined') {
    // Universal regex fallback for Node.js test runner & non-DOM environments
    let html = '<article class="docx-document">'
    const blockRegex = /<(?:w:)?(p|tbl)(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?\1>/g
    let match
    while ((match = blockRegex.exec(xmlString)) !== null) {
      const tag = match[1]
      const blockContent = match[0]
      if (tag === 'tbl') {
        html += '<table class="docx-table"><tbody>'
        const trRegex = /<(?:w:)?tr(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?tr>/g
        let trMatch
        while ((trMatch = trRegex.exec(blockContent)) !== null) {
          html += '<tr>'
          const tcRegex = /<(?:w:)?tc(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?tc>/g
          let tcMatch
          while ((tcMatch = tcRegex.exec(trMatch[0])) !== null) {
            const cellTexts = []
            const tRegex = /<(?:w:)?t(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?t>/g
            let tMatch
            while ((tMatch = tRegex.exec(tcMatch[0])) !== null) {
              cellTexts.push(tMatch[1])
            }
            html += `<td>${escapeHtml(cellTexts.join(' '))}</td>`
          }
          html += '</tr>'
        }
        html += '</tbody></table>'
      } else if (tag === 'p') {
        let headingLevel = 0
        const pStyleMatch = blockContent.match(/<(?:w:)?pStyle[^>]*w:val="([^"]+)"/)
        if (pStyleMatch) {
          const val = pStyleMatch[1]
          if (/heading\s*1/i.test(val) || val === '1') headingLevel = 1
          else if (/heading\s*2/i.test(val) || val === '2') headingLevel = 2
          else if (/heading\s*3/i.test(val) || val === '3') headingLevel = 3
        }
        const outTag = headingLevel > 0 ? `h${headingLevel}` : 'p'
        let runHtml = ''
        const rRegex = /<(?:w:)?r(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?r>/g
        let rMatch
        while ((rMatch = rRegex.exec(blockContent)) !== null) {
          const rContent = rMatch[0]
          const isBold = /<(?:w:)?b(?:\s|\/|>)/.test(rContent)
          const isItalic = /<(?:w:)?i(?:\s|\/|>)/.test(rContent)
          const isUnderline = /<(?:w:)?u(?:\s|\/|>)/.test(rContent)
          const tRegex = /<(?:w:)?t(?:\s[^>]*|>)([\s\S]*?)<\/(?:w:)?t>/g
          let tMatch
          let runText = ''
          while ((tMatch = tRegex.exec(rContent)) !== null) {
            runText += tMatch[1]
          }
          if (!runText) continue
          let formatted = escapeHtml(runText)
          if (isBold) formatted = `<strong>${formatted}</strong>`
          if (isItalic) formatted = `<em>${formatted}</em>`
          if (isUnderline) formatted = `<u>${formatted}</u>`
          runHtml += formatted
        }
        if (runHtml.trim()) {
          html += `<${outTag} class="docx-${outTag}">${runHtml}</${outTag}>`
        }
      }
    }
    html += '</article>'
    return html
  }

  let doc
  try {
    const parser = new DOMParser()
    doc = parser.parseFromString(xmlString, 'text/xml')
  } catch (err) {
    return `<div class="docx-error">Failed to parse Word XML: ${escapeHtml(err.message)}</div>`
  }

  const body = doc.querySelector('body') || doc.documentElement
  if (!body) return '<div class="docx-empty">Empty Word document.</div>'

  let html = '<article class="docx-document">'

  // Process paragraphs and tables in order
  const elements = body.childNodes
  for (const node of elements) {
    if (node.nodeType !== 1) continue
    const tag = node.localName || node.nodeName

    // 1. Table
    if (tag === 'tbl') {
      html += '<table class="docx-table"><tbody>'
      const rows = node.getElementsByTagNameNS('*', 'tr')
      for (let r = 0; r < rows.length; r++) {
        html += '<tr>'
        const cells = rows[r].getElementsByTagNameNS('*', 'tc')
        for (let c = 0; c < cells.length; c++) {
          const cellTexts = []
          const texts = cells[c].getElementsByTagNameNS('*', 't')
          for (let t = 0; t < texts.length; t++) {
            cellTexts.push(texts[t].textContent)
          }
          html += `<td>${escapeHtml(cellTexts.join(' '))}</td>`
        }
        html += '</tr>'
      }
      html += '</tbody></table>'
      continue
    }

    // 2. Paragraph
    if (tag === 'p') {
      const pPr = node.getElementsByTagNameNS('*', 'pPr')[0]
      let headingLevel = 0

      if (pPr) {
        const pStyle = pPr.getElementsByTagNameNS('*', 'pStyle')[0]
        if (pStyle) {
          const val = pStyle.getAttribute('w:val') || ''
          if (/heading\s*1/i.test(val) || val === '1') headingLevel = 1
          else if (/heading\s*2/i.test(val) || val === '2') headingLevel = 2
          else if (/heading\s*3/i.test(val) || val === '3') headingLevel = 3
        }
      }

      const outTag = headingLevel > 0 ? `h${headingLevel}` : 'p'
      let runHtml = ''

      const runs = node.getElementsByTagNameNS('*', 'r')
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i]
        const rPr = r.getElementsByTagNameNS('*', 'rPr')[0]
        const isBold = rPr && rPr.getElementsByTagNameNS('*', 'b').length > 0
        const isItalic = rPr && rPr.getElementsByTagNameNS('*', 'i').length > 0
        const isUnderline = rPr && rPr.getElementsByTagNameNS('*', 'u').length > 0

        const texts = r.getElementsByTagNameNS('*', 't')
        let runText = ''
        for (let t = 0; t < texts.length; t++) {
          runText += texts[t].textContent
        }

        if (!runText) continue
        let formatted = escapeHtml(runText)
        if (isBold) formatted = `<strong>${formatted}</strong>`
        if (isItalic) formatted = `<em>${formatted}</em>`
        if (isUnderline) formatted = `<u>${formatted}</u>`

        runHtml += formatted
      }

      if (runHtml.trim()) {
        html += `<${outTag} class="docx-${outTag}">${runHtml}</${outTag}>`
      }
    }
  }

  html += '</article>'
  return html
}

/**
 * End-to-end renderer from .docx Blob or ArrayBuffer to styled HTML container
 * @param {ArrayBuffer|Blob} data
 * @returns {Promise<string>} rendered HTML
 */
export async function renderDocxToHtml(data) {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data
  const xml = await extractDocxXml(buffer)
  return parseDocxXmlToHtml(xml)
}
