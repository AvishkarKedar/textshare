/**
 * Room Bookmarks & Recents Manager for AnonShare
 * Stores recently visited rooms and their secret encryption keys in localStorage
 * so users never lose their collaborative workspaces if a tab is closed.
 */

const STORAGE_KEY = 'anonshare_recent_rooms'
const MAX_BOOKMARKS = 20
const memStorage = new Map()

function getStorage() {
  if (typeof localStorage !== 'undefined' && localStorage) return localStorage
  return {
    getItem: k => memStorage.get(k) || null,
    setItem: (k, v) => memStorage.set(k, String(v)),
    removeItem: k => memStorage.delete(k)
  }
}

export function getBookmarks() {
  try {
    const raw = getStorage().getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

export function saveBookmark({ code, key = '', role = 'peer', title = '', language = 'markdown' }) {
  if (!code) return
  try {
    const list = getBookmarks()
    const existingIdx = list.findIndex(item => item.code.toUpperCase() === code.toUpperCase())
    const item = {
      code: code.toUpperCase(),
      key: key || '',
      role: role || 'peer',
      title: (title || '').slice(0, 50) || `Room ${code.toUpperCase()}`,
      language: language || 'markdown',
      lastVisited: Date.now()
    }

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...item }
    } else {
      list.unshift(item)
    }

    // Keep at most MAX_BOOKMARKS
    const trimmed = list.slice(0, MAX_BOOKMARKS)
    getStorage().setItem(STORAGE_KEY, JSON.stringify(trimmed))
    return trimmed
  } catch (e) {
    return []
  }
}

export function removeBookmark(code) {
  if (!code) return
  try {
    const list = getBookmarks().filter(item => item.code.toUpperCase() !== code.toUpperCase())
    getStorage().setItem(STORAGE_KEY, JSON.stringify(list))
    return list
  } catch (e) {
    return []
  }
}

export function clearBookmarks() {
  try {
    getStorage().removeItem(STORAGE_KEY)
    return []
  } catch (e) {
    return []
  }
}
