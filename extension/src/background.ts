import { registerLoginHandler } from './auth'
import { getSaveSubfolder } from './screenshotLocation'

chrome.runtime.onInstalled.addListener(() => {
  console.log('TraceShot extension installed');
});

// Run the OAuth flow here, not in the popup: the popup closes when the Google
// sign-in window takes focus (non-fullscreen), killing the flow. See auth.ts.
registerLoginHandler();

interface Region {
  x: number
  y: number
  w: number
  h: number
}

// Flow across the three contexts (see overlay.ts, HomePage.tsx):
//   START_CAPTURE  (popup)          -> inject the overlay into the active tab
//   REGION_SELECTED (content script) -> capture + crop, return the image for preview
//   CONFIRM_SAVE   (content script)  -> user hit Confirm; download the previewed image
// Capture only lives here because captureVisibleTab is not available to popup/content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'START_CAPTURE') {
    // Respond only after the overlay is injected so the popup stays open until the worker
    // (possibly cold-starting) has done the work — otherwise the popup closes mid-handshake.
    startCapture().then(() => sendResponse({ ok: true }))
    return true // keep the channel open for the async response
  } else if (message?.type === 'REGION_SELECTED') {
    captureRegion(message.rect, message.dpr, sender).then(sendResponse)
    return true // keep the channel open for the async response
  } else if (message?.type === 'CONFIRM_SAVE') {
    saveImage(message.imageUrl)
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

// Capture the visible tab and crop to the selected region. Returns the cropped PNG as a
// data URL for the on-page preview; saving waits for CONFIRM_SAVE.
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

// Save the confirmed image into the user's chosen subfolder under Downloads. chrome.downloads
// is the only save API that works silently from the worker, and it writes within Downloads —
// so the location, being a relative path there, can never be unreachable. uniquify avoids
// clobbering an existing file of the same name.
async function saveImage(imageUrl: string) {
  const subfolder = await getSaveSubfolder()
  const base = `traceshot-${Date.now()}.png`
  const filename = subfolder ? `${subfolder}/${base}` : base
  try {
    await chrome.downloads.download({ url: imageUrl, filename, conflictAction: 'uniquify' })
  } catch (error) {
    console.error('[TraceShot] Save failed:', error)
  }
}

// captureVisibleTab returns a physical-pixel image (dpr-scaled), but the region is in CSS
// pixels — so scale the crop rect by dpr. Uses OffscreenCanvas since the worker has no DOM.
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

// chrome.downloads needs a URL; the worker has neither URL.createObjectURL nor FileReader,
// so base64-encode the bytes into a data URL by hand.
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:image/png;base64,${btoa(binary)}`
}
