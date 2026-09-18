/**
 * End-to-End Encrypted Large File Sharing for AnonShare (up to 25MB)
 * Files are chunked into 64KB slices and encrypted client-side with AES-GCM
 * using the room key before upload. Decrypted client-side upon download.
 */

const CHUNK_SIZE = 64 * 1024 // 64 KB per chunk
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB max

async function sha256Bytes(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function encryptChunk(key, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, arrayBuffer)
  const combined = new Uint8Array(12 + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), 12)
  return combined
}

async function decryptChunk(key, uint8Array) {
  const iv = uint8Array.slice(0, 12)
  const ciphertext = uint8Array.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new Uint8Array(decrypted)
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  let lastErr = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.ok) return res
      let errDetail = ''
      try {
        const data = await res.clone().json()
        errDetail = data?.error ? `: ${data.error}` : ''
      } catch (e) {}
      if (res.status === 404 && errDetail.includes('no_room')) {
        throw new Error('Room does not exist or has expired on the relay')
      }
      if (res.status === 403) {
        throw new Error('Unauthorized room access')
      }
      if (attempt < maxRetries && (res.status >= 500 || res.status === 429)) {
        await new Promise(r => setTimeout(r, 300 * Math.pow(1.5, attempt)))
        continue
      }
      throw new Error(`HTTP ${res.status}${errDetail}`)
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 300 * Math.pow(1.5, attempt)))
      }
    }
  }
  throw lastErr
}

export function isCodeOrTextFile(file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()

  const binaryExts = [
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'rtf',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff',
    'mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv',
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
    'zip', 'tar', 'gz', '7z', 'rar', 'bz2', 'xz',
    'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'img', 'apk', 'jar'
  ]
  const ext = name.split('.').pop() || ''
  if (binaryExts.includes(ext)) return false

  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript') {
    return true
  }

  const codeExts = [
    'txt', 'md', 'markdown', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
    'py', 'pyw', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'java',
    'go', 'rs', 'sh', 'bash', 'zsh', 'json', 'html', 'htm', 'css',
    'scss', 'sass', 'less', 'sql', 'yaml', 'yml', 'toml', 'ini',
    'env', 'csv', 'tsv', 'xml', 'asm', 's', 'r', 'rb', 'php'
  ]
  return codeExts.includes(ext)
}

export async function uploadEncryptedFile({
  file,
  roomCode,
  relayHost,
  roomKey,
  authToken,
  onProgress = () => {},
}) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of 25 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
  }

  const fileId = 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const fileBuffer = await file.arrayBuffer()
  const fileHash = await sha256Bytes(fileBuffer)

  const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
  const baseUrl = `${proto}//${clean}/room/${roomCode}/files/${fileId}`

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunkRaw = fileBuffer.slice(start, end)
    const encryptedChunk = await encryptChunk(roomKey, chunkRaw)

    const url = `${baseUrl}/chunk/${i}?a=${encodeURIComponent(authToken || '')}`
    try {
      await fetchWithRetry(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: encryptedChunk,
      })
    } catch (err) {
      throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks} (${err.message})`)
    }

    onProgress({
      chunk: i + 1,
      totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100),
      bytesUploaded: end,
      totalBytes: file.size,
    })
  }

  return {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    totalChunks,
    sha256: fileHash,
    uploadedAt: Date.now(),
  }
}

export async function downloadAndDecryptFile({
  fileMeta,
  roomCode,
  relayHost,
  roomKey,
  authToken,
  onProgress = () => {},
}) {
  const { id: fileId, name, size, type, totalChunks, sha256 } = fileMeta
  const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
  const baseUrl = `${proto}//${clean}/room/${roomCode}/files/${fileId}`

  const decryptedChunks = []

  for (let i = 0; i < totalChunks; i++) {
    const url = `${baseUrl}/chunk/${i}?a=${encodeURIComponent(authToken || '')}`
    let res
    try {
      res = await fetchWithRetry(url, { method: 'GET' })
    } catch (err) {
      if (err.message.includes('404')) {
        throw new Error(`Chunk ${i + 1}/${totalChunks} is missing on the relay (file expired or purged). Re-uploading is required.`)
      }
      throw new Error(`Failed to download chunk ${i + 1}/${totalChunks}: ${err.message}`)
    }

    const encryptedData = new Uint8Array(await res.arrayBuffer())
    const decryptedChunk = await decryptChunk(roomKey, encryptedData)
    decryptedChunks.push(decryptedChunk)

    onProgress({
      chunk: i + 1,
      totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100),
    })
  }

  const blob = new Blob(decryptedChunks, { type: type || 'application/octet-stream' })

  // Verify SHA-256 integrity
  const assembledBuffer = await blob.arrayBuffer()
  const downloadedHash = await sha256Bytes(assembledBuffer)
  if (sha256 && downloadedHash !== sha256) {
    throw new Error('Integrity check failed: decrypted file hash does not match original')
  }

  return blob
}

export function saveBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
