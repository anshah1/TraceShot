import { registerLoginHandler, getSession } from './auth'
import { getSaveSubfolder } from './screenshotLocation'
import { buildScreenshotFilename } from './filename'
import { generateScreenshotId } from './id'
import { BORDER_H, STRIP_PIXELS, paintWatermarkFrame } from './watermark'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const WATERMARK_ID = /^[a-p]{14}$/
const REGISTER_TIMEOUT_MS = 8000

// OAuth runs here, not the popup: the popup closes when the sign-in window takes focus. See auth.ts.
registerLoginHandler();

interface Region {
  x: number
  y: number
  w: number
  h: number
}

type SaveResult = { ok: true } | { ok: false; message: string }

// START_CAPTURE / REGION_SELECTED / CONFIRM_SAVE across popup + overlay; capture lives here since captureVisibleTab is worker-only.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'START_CAPTURE') {
    // Respond only after injection so the popup stays open until the (cold-starting) worker finishes,
    // and so it can surface a reason when the overlay can't be injected (restricted pages).
    startCapture().then(sendResponse)
    return true // keep the channel open for the async response
  } else if (message?.type === 'REGION_SELECTED') {
    captureFull(sender).then(sendResponse)
    return true // keep the channel open for the async response
  } else if (message?.type === 'CONFIRM_SAVE') {
    // CONFIRM_SAVE comes from the content script, so sender.tab carries the page title/url.
    confirmSave(message.fullDataUrl, message.rect, message.dpr, message.id, sender.tab).then(sendResponse)
    return true // keep the channel open so the overlay can show a save/register error
  }
})

// Register the watermark key + page metadata so a dropped shot can later resolve to its source URL.
// Skipped silently when the region was too small to watermark (id null); never blocks the save.
async function registerSnapshot(id: string | null, tab?: chrome.tabs.Tab): Promise<SaveResult> {
  if (!id || !WATERMARK_ID.test(id) || !tab?.url || !tab?.title) return { ok: true }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS)
  try {
    const origin = new URL(tab.url).origin
    const res = await fetch(`${BACKEND_URL}/api/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenshotId: id, url: tab.url, title: tab.title, origin }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error('[TraceShot] snapshot register failed:', res.status)
      return { ok: false, message: "Saved, but the server couldn't record it — this screenshot won't be traceable." }
    }
    return { ok: true }
  } catch (error) {
    console.error('[TraceShot] snapshot register failed:', error)
    return { ok: false, message: "Saved, but the server was unreachable — this screenshot won't be traceable." }
  } finally {
    clearTimeout(timeout)
  }
}

type CaptureStart = { ok: true } | { ok: false; reason: 'no-tab' | 'restricted' | 'local-file' }

// Local files opened in Chrome (e.g. a PDF viewed from disk) have a file:// URL whose origin is null
// and which means nothing to anyone else — so a shot of one can't resolve back to a shareable link.
// Blocked (with its own message) at both the start-of-capture and capture-time gates.
function isLocalFile(url?: string): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'file:'
  } catch {
    return false
  }
}

// Inject the region-selection overlay into the active tab; report why if it can't be injected.
async function startCapture(): Promise<CaptureStart> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { ok: false, reason: 'no-tab' }
  if (isLocalFile(tab.url)) return { ok: false, reason: 'local-file' }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] })
    return { ok: true }
  } catch (error) {
    // Fails on restricted pages (chrome://, the Web Store, other extensions, PDFs) where scripts can't run.
    console.error('Failed to start capture overlay:', error)
    return { ok: false, reason: 'restricted' }
  }
}

// Capture the visible tab and mint the watermark id; the crop + watermark run later on CONFIRM_SAVE,
// so the preview can paint instantly from the full shot instead of waiting on the crop/encode.
async function captureFull(
  sender: chrome.runtime.MessageSender,
): Promise<{ fullDataUrl: string; id: string | null } | { error: string }> {
  try {
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT
    // captureVisibleTab grabs whatever tab is visible now, which may differ from the tab the overlay was
    // injected into (user switched to a local file with the crosshair still up). Re-check before capturing.
    const [active] = await chrome.tabs.query({ active: true, windowId })
    if (isLocalFile(active?.url)) {
      return { error: "Can't trace a local file — switch back to a web page with a shareable URL." }
    }
    const fullDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    const id = await buildWatermarkId()
    return { fullDataUrl, id }
  } catch (error) {
    console.error('Capture failed:', error)
    return { error: 'Capture failed. Please try again.' }
  }
}

// After the user confirms: crop the region out of the full shot, paint the watermark, save, then register.
// Returns the watermarked PNG data URL so the overlay can also copy it to the clipboard (the worker can't).
async function confirmSave(
  fullDataUrl: string,
  rect: Region,
  dpr: number,
  id: string | null,
  tab?: chrome.tabs.Tab,
): Promise<SaveResult & { dataUrl?: string }> {
  let cropped: string
  try {
    cropped = await cropToRegion(fullDataUrl, rect, dpr, id)
    await saveImage(cropped, tab?.title)
  } catch (error) {
    console.error('[TraceShot] Confirm/save failed:', error)
    return { ok: false, message: 'Could not save the screenshot. Please try again.' }
  }
  // Include dataUrl even when registration fails: the shot is saved and still worth copying, just not traceable.
  return { ...(await registerSnapshot(id, tab)), dataUrl: cropped }
}

// userId (7-char, from the session) + a fresh 7-char screenshotId = the 14-char [a-p] watermark key.
// Returns null (no watermark) when there's no valid signed-in user id to anchor it to.
async function buildWatermarkId(): Promise<string | null> {
  const session = await getSession()
  const userId = session?.user?.userId
  if (!userId || !/^[a-p]{7}$/.test(userId)) {
    console.warn('[TraceShot] no valid userId in session; skipping watermark')
    return null
  }
  return userId + generateScreenshotId()
}

// Save into the chosen subfolder under Downloads; chrome.downloads is the only silent worker save API, uniquify avoids clobbering.
async function saveImage(imageUrl: string, title?: string) {
  const subfolder = await getSaveSubfolder()
  const base = buildScreenshotFilename(title)
  const filename = subfolder ? `${subfolder}/${base}` : base
  try {
    await chrome.downloads.download({ url: imageUrl, filename, conflictAction: 'uniquify' })
  } catch (error) {
    console.error('[TraceShot] Save failed:', error)
    throw error
  }
}

// Scale the CSS-pixel crop rect by dpr (the capture is physical-pixel); OffscreenCanvas since the worker has no DOM.
// With an id, the crop is inset inside a BORDER_H frame that carries the watermark on all 4 edges.
async function cropToRegion(dataUrl: string, rect: Region, dpr: number, id: string | null): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  const bitmap = await createImageBitmap(blob)

  const sx = Math.round(rect.x * dpr)
  const sy = Math.round(rect.y * dpr)
  const sw = Math.round(rect.w * dpr)
  const sh = Math.round(rect.h * dpr)

  // Too small to hold a 30px run on any edge: save a plain crop, no frame.
  const canEmbed = id !== null && (sw >= STRIP_PIXELS || sh >= STRIP_PIXELS)
  const B = canEmbed ? BORDER_H : 0
  const outW = sw + 2 * B
  const outH = sh + 2 * B

  const canvas = new OffscreenCanvas(outW, outH)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable')
  ctx.drawImage(bitmap, sx, sy, sw, sh, B, B, sw, sh)

  if (canEmbed) {
    const img = ctx.getImageData(0, 0, outW, outH)
    paintWatermarkFrame(img.data, outW, outH, sw, sh, B, id!)
    ctx.putImageData(img, 0, 0)
  }

  const out = await canvas.convertToBlob({ type: 'image/png' })
  return blobToDataUrl(out)
}

// Base64-encode to a data URL by hand: the worker has neither URL.createObjectURL nor FileReader.
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:image/png;base64,${btoa(binary)}`
}
