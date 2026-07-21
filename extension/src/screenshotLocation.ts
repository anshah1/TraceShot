// Save subfolder under Downloads, stored in chrome.storage.local; we stay in Downloads since chrome.downloads only writes there. See background.ts saveImage().

export const DEFAULT_SUBFOLDER = 'TraceShot'

const SUBFOLDER_KEY = 'saveSubfolder'

// Undefined = never configured -> default TraceShot; empty string = a deliberate "no subfolder", preserved as-is.
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

// Keep it a safe relative path inside Downloads: drop rejected chars, strip ".." so it can't escape, tidy slashes.
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
