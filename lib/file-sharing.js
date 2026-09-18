/**
 * End-to-end encrypted file sharing (25 MiB maximum).
 */
const CHUNK_SIZE = 64 * 1024
const MAX_FILE_SIZE = 25 * 1024 * 1024

async function sha256Bytes(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

async function encryptChunk(key, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, arrayBuffer)
  const combined = new Uint8Array(12 + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), 12)
  return combined
}

async function decryptChunk(key, bytes) {
  if (bytes.byteLength < 29) throw new Error('Encrypted chunk is invalid')
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)
  ))
}

function retryDelay(response, attempt) {
  const retryAfter = response?.headers?.get?.('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10000)
  }
  return Math.min(300 * (2 ** attempt) + Math.random() * 150, 5000)
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response
    try { response = await fetch(url, options) }
    catch (error) {
      lastError = error
      if (attempt === maxRetries) break
      await new Promise(resolve => setTimeout(resolve, retryDelay(null, attempt)))
      continue
    }
    if (response.ok) return response
    let detail = ''
    try { detail = (await response.clone().json())?.error || '' } catch (_) {}
    if (response.status === 404 && detail === 'no_room') throw new Error('Room does not exist or has expired on the relay')
    if (response.status === 403) throw new Error('Unauthorized room access')
    const error = new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
    if (!retryable || attempt === maxRetries) throw error
    lastError = error
    await new Promise(resolve => setTimeout(resolve, retryDelay(response, attempt)))
  }
  throw lastError || new Error('Network request failed')
}

function authHeaders(authToken, extra = {}) {
  return { ...extra, Authorization: `Bearer ${authToken || ''}` }
}

export function isCodeOrTextFile(file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()
  const binary = ['pdf','docx','doc','pptx','ppt','xlsx','xls','odt','rtf','png','jpg','jpeg','gif','webp','bmp','ico','tiff','mp4','webm','mov','avi','mkv','flv','wmv','mp3','wav','ogg','m4a','flac','aac','zip','tar','gz','7z','rar','bz2','xz','exe','dll','so','dylib','bin','iso','img','apk','jar']
  const extension = name.split('.').pop() || ''
  if (binary.includes(extension)) return false
  if (mime.startsWith('text/') || ['application/json','application/xml','application/javascript'].includes(mime)) return true
  return ['txt','md','markdown','js','mjs','cjs','ts','jsx','tsx','py','pyw','c','cpp','cc','cxx','h','hpp','hh','java','go','rs','sh','bash','zsh','json','html','htm','css','scss','sass','less','sql','yaml','yml','toml','ini','env','csv','tsv','xml','asm','s','r','rb','php'].includes(extension)
}

export async function uploadEncryptedFile({ file, roomCode, relayHost, roomKey, authToken, onProgress = () => {} }) {
  if (!file || file.size > MAX_FILE_SIZE) throw new Error(`File exceeds maximum size of 25 MB (${((file?.size || 0) / 1048576).toFixed(1)} MB)`)
  const fileId = `att_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const fileHash = await sha256Bytes(await file.arrayBuffer())
  const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
  const baseUrl = `${proto}//${clean}/room/${encodeURIComponent(roomCode)}/files/${encodeURIComponent(fileId)}`

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const encrypted = await encryptChunk(roomKey, await file.slice(start, end).arrayBuffer())
    try {
      await fetchWithRetry(`${baseUrl}/chunk/${i}`, {
        method: 'PUT',
        headers: authHeaders(authToken, { 'Content-Type': 'application/octet-stream' }),
        body: encrypted,
      })
    } catch (error) { throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks} (${error.message})`) }
    onProgress({ chunk: i + 1, totalChunks, percent: Math.round((i + 1) / totalChunks * 100), bytesUploaded: end, totalBytes: file.size })
  }
  return { id: fileId, name: file.name, size: file.size, type: file.type || 'application/octet-stream', totalChunks, sha256: fileHash, uploadedAt: Date.now() }
}

export async function downloadAndDecryptFile({ fileMeta, roomCode, relayHost, roomKey, authToken, onProgress = () => {} }) {
  const { id, type, totalChunks, sha256 } = fileMeta
  if (!Number.isSafeInteger(totalChunks) || totalChunks < 0 || totalChunks > Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE)) throw new Error('Invalid file metadata')
  const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
  const baseUrl = `${proto}//${clean}/room/${encodeURIComponent(roomCode)}/files/${encodeURIComponent(id)}`
  const chunks = []
  for (let i = 0; i < totalChunks; i++) {
    let response
    try { response = await fetchWithRetry(`${baseUrl}/chunk/${i}`, { method: 'GET', headers: authHeaders(authToken) }) }
    catch (error) { throw new Error(`Failed to download chunk ${i + 1}/${totalChunks}: ${error.message}`) }
    chunks.push(await decryptChunk(roomKey, new Uint8Array(await response.arrayBuffer())))
    onProgress({ chunk: i + 1, totalChunks, percent: Math.round((i + 1) / totalChunks * 100) })
  }
  const blob = new Blob(chunks, { type: type || 'application/octet-stream' })
  if (sha256 && await sha256Bytes(await blob.arrayBuffer()) !== sha256) throw new Error('Integrity check failed: decrypted file hash does not match original')
  return blob
}

export function saveBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
