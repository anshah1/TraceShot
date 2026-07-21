import { registerLoginHandler } from './auth'
import { getSaveSubfolder } from './screenshotLocation'
import { buildScreenshotFilename } from './filename'

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
    captureRegion(message.rect, message.dpr, sender).then(sendResponse)
    return true // keep the channel open for the async response
  } else if (message?.type === 'CONFIRM_SAVE') {
    // CONFIRM_SAVE comes from the content script, so sender.tab carries the page title.
    saveImage(message.imageUrl, sender.tab?.title)
  }
})

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

// Capture + crop the visible tab, returning the cropped PNG as a data URL for preview; saving waits for CONFIRM_SAVE.
async function captureRegion(
  rect: Region,
  dpr: number,
  sender: chrome.runtime.MessageSender,
): Promise<{ imageUrl: string } | { error: string }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT, {
      format: 'png',
    })
    const cropped = await cropToRegion(dataUrl, rect, dpr)
    return { imageUrl: cropped }
  } catch (error) {
    console.error('Capture/crop failed:', error)
    return { error: String(error) }
  }
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
async function cropToRegion(dataUrl: string, rect: Region, dpr: number): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  const bitmap = await createImageBitmap(blob)

  const sx = Math.round(rect.x * dpr)
  const sy = Math.round(rect.y * dpr)
  const sw = Math.round(rect.w * dpr)
  const sh = Math.round(rect.h * dpr)

  const canvas = new OffscreenCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)

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
