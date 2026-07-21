// Builds self-describing screenshot filenames: TraceShot_{YYYYMMDD-HHMMSS}_{title}.png.
// Page titles are hostile input (path separators, chars illegal on macOS/Windows, emoji,
// newlines), so the title is always sanitized before it reaches chrome.downloads.

const MAX_TITLE_LEN = 40

// Sanitize a page title into a safe filename segment. Returns '' if nothing usable remains,
// so callers can drop the title segment entirely rather than emit a stray separator.
function sanitizeTitle(title: string): string {
  return title
    .normalize('NFKD') // split accents (é -> e + mark) so the base letter survives ASCII filtering
    .replace(/[/\\:*?"<>|]/g, ' ') // reserved filename chars, incl. the path-separating '/'
    .replace(/[\x00-\x1F\x7F]/g, ' ') // control chars and newlines
    .replace(/[^\x20-\x7E]/g, '') // drop remaining non-ASCII (emoji, combining marks, etc.)
    .trim()
    .replace(/\s+/g, '_') // collapse whitespace runs into a single underscore
    .slice(0, MAX_TITLE_LEN) // some titles are 150+ chars; cap to avoid path-length issues
    .replace(/_+$/, '') // no trailing underscore if truncation landed mid-word
}

// Local-time timestamp with no colons (colons are illegal in filenames on macOS/Windows).
function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

// Timestamp-first so a folder listing sorts chronologically. Blank/unusable titles collapse
// to TraceShot_{timestamp}.png; second precision + downloads' uniquify handle collisions.
export function buildScreenshotFilename(title: string | undefined): string {
  const stamp = timestamp()
  const safe = sanitizeTitle(title ?? '')
  return safe ? `TraceShot_${stamp}_${safe}.png` : `TraceShot_${stamp}.png`
}
