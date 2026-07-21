// Where screenshots save: a subfolder under the system Downloads folder, stored as a plain
// string in chrome.storage.local. We stay inside Downloads on purpose -- chrome.downloads is
// the only save API that works silently from the service worker, and it can only write within
// the Downloads tree. See background.ts saveImage().

export const DEFAULT_SUBFOLDER = 'TraceShot'

const SUBFOLDER_KEY = 'saveSubfolder'

// Undefined means never configured -> default to TraceShot. An empty string is a deliberate
// choice to save straight to Downloads with no subfolder, so it's preserved as-is.
export async function getSaveSubfolder(): Promise<string> {
  const result = await chrome.storage.local.get(SUBFOLDER_KEY)
  const stored = result[SUBFOLDER_KEY] as string | undefined
  return stored === undefined ? DEFAULT_SUBFOLDER : stored
}

/** Store a subfolder name, sanitized so it's always a valid relative path inside Downloads. */
export async function setSaveSubfolder(name: string): Promise<string> {
  const clean = sanitizeSubfolder(name)
  await chrome.storage.local.set({ [SUBFOLDER_KEY]: clean })
  return clean
}

/** Shown in the popup so the user sees the full path they're saving to. */
export function formatSaveLocation(subfolder: string): string {
  return subfolder ? `Downloads/${subfolder}` : 'Downloads'
}

// Keep it a safe relative path inside Downloads: drop characters chrome.downloads rejects
// (spaces and hyphens are fine), strip any ".." segment so it can't escape Downloads, and
// tidy the slashes.
function sanitizeSubfolder(name: string): string {
  const clean = name
    .trim()
    .replace(/["*:<>?\\|]/g, '')
    .replace(/\.\.(?=\/|$)/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  return clean // empty is valid: save straight to Downloads
}
