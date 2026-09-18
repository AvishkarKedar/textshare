/**
 * A minimal ZIP writer, stored (uncompressed) entries only.
 *
 * Pulling in a compression library for "download my three text files" would
 * cost more bytes than it saves, and everything here is short text anyway.
 */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/**
 * @param {Array<{name: string, text: string}>} entries
 * @returns {Blob} a zip file
 */
export function makeZip(entries) {
  const enc = new TextEncoder()
  const now = dosTime(new Date())
  const chunks = []
  const central = []
  let offset = 0

  const u16 = n => [n & 0xff, (n >>> 8) & 0xff]
  const u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

  // De-duplicate names, since two files in a room may share one.
  const used = new Set()

  for (const e of entries) {
    let name = (e.name || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '_')
    let i = 2
    while (used.has(name)) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      name = base + '-' + i++ + ext
    }
    used.add(name)

    const nameBytes = enc.encode(name)
    const data = enc.encode(e.text || '')
    const crc = crc32(data)

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0),
    ]
    chunks.push(new Uint8Array(local), nameBytes, data)

    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ]), nameBytes)

    offset += local.length + nameBytes.length + data.length
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0)
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ])

  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}
