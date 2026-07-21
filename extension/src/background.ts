import { registerLoginHandler, getSession } from './auth'
import { getSaveSubfolder } from './screenshotLocation'
import { buildScreenshotFilename } from './filename'
import { generateScreenshotId } from './id'
import { BORDER_H, STRIP_PIXELS, paintWatermarkFrame } from './watermark'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const WATERMARK_ID = /^[a-p]{14}$/
const REGISTER_TIMEOUT_MS = 8000

chrome.runtime.onInstalled.addListener(() => {
  console.log('TraceShot extension installed');
});

// OAuth runs here, not the popup: the popup closes when the sign-in window takes focus. See auth.ts.
registerLoginHandler();

interface Region {
  x: number
  y: number
  w: number
  h: number
}

// START_CAPTURE / REGION_SELECTED / CONFIRM_SAVE across popup + overlay; capture lives here since captureVisibleTab is worker-only.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'START_CAPTURE') {
    // Respond only after injection so the popup stays open until the (cold-starting) worker finishes.
    startCapture().then(() => sendResponse({ ok: true }))
    return true // keep the channel open for the async response
  } else if (message?.type === 'REGION_SELECTED') {
    captureFull(sender).then(sendResponse)
    return true // keep the channel open for the async response
  } else if (message?.type === 'CONFIRM_SAVE') {
    // CONFIRM_SAVE comes from the content script, so sender.tab carries the page title/url.
    confirmSave(message.fullDataUrl, message.rect, message.dpr, message.id, sender.tab)
  }
})

// Register the watermark key + page metadata so a dropped shot can later resolve to its source URL.
// Skipped silently when the region was too small to watermark (id null); never blocks the save.
async function registerSnapshot(id: string | null, tab?: chrome.tabs.Tab) {
  if (!id || !WATERMARK_ID.test(id) || !tab?.url || !tab?.title) return
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
    if (!res.ok) console.error('[TraceShot] snapshot register failed:', res.status)
  } catch (error) {
    console.error('[TraceShot] snapshot register failed:', error)
  } finally {
    clearTimeout(timeout)
  }
}

// Inject the region-selection overlay into the active tab.
async function startCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] })
  } catch (error) {
    // Fails on restricted pages (chrome://, the Web Store, etc.) where scripts can't run.
    console.error('Failed to start capture overlay:', error)
  }
}

// Capture the visible tab and mint the watermark id; the crop + watermark run later on CONFIRM_SAVE,
// so the preview can paint instantly from the full shot instead of waiting on the crop/encode.
async function captureFull(
  sender: chrome.runtime.MessageSender,
): Promise<{ fullDataUrl: string; id: string | null } | { error: string }> {
  try {
    const fullDataUrl = await chrome.tabs.captureVisibleTab(sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT, {
      format: 'png',
    })
    const id = await buildWatermarkId()
    return { fullDataUrl, id }
  } catch (error) {
    console.error('Capture failed:', error)
    return { error: String(error) }
  }
}

// After the user confirms: crop the region out of the full shot, paint the watermark, save, then register.
async function confirmSave(fullDataUrl: string, rect: Region, dpr: number, id: string | null, tab?: chrome.tabs.Tab) {
  try {
    const cropped = await cropToRegion(fullDataUrl, rect, dpr, id)
    await saveImage(cropped, tab?.title)
  } catch (error) {
    console.error('[TraceShot] Confirm/save failed:', error)
    return
  }
  registerSnapshot(id, tab)
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
    console.log('[TraceShot] embedded watermark id:', id)
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
