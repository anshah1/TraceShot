// Persists where screenshots save: the folder NAME goes in chrome.storage.local (JSON, for display),
// the live FileSystemDirectoryHandle goes in IndexedDB (only store that survives a handle intact).

declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  }
}

export const DEFAULT_SAVE_LOCATION = 'Documents/TraceShot'

const NAME_KEY = 'saveLocationName'
const IDB_NAME = 'traceshot'
const IDB_STORE = 'handles'
const HANDLE_KEY = 'saveDirectory'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const request = tx.objectStore(IDB_STORE).get(key)
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function getSaveLocationName(): Promise<string> {
  const result = await chrome.storage.local.get(NAME_KEY)
  return (result[NAME_KEY] as string | undefined) || DEFAULT_SAVE_LOCATION
}

/** The browser only exposes a folder's leaf name, so a picked folder shows as "…/Name"; the default keeps its full path. */
export function formatSaveLocation(name: string): string {
  return name === DEFAULT_SAVE_LOCATION ? name : `…/${name}`
}

export async function pickSaveLocation(): Promise<string | null> {
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (error) {
    // User dismissing the dialog throws AbortError; treat any failure as a no-op.
    if ((error as DOMException)?.name !== 'AbortError') console.error('Folder picker failed:', error)
    return null
  }
  await idbPut(HANDLE_KEY, handle)
  await chrome.storage.local.set({ [NAME_KEY]: handle.name })
  return handle.name
}

export async function getSaveDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)
}
