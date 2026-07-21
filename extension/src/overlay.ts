// Region-selection overlay injected into the active tab: Select (dimmed drag box) then Preview (Confirm/Retake); dim is removed before capture so it never shows in the shot.

import { STRIP_PIXELS } from './watermark'

interface OverlayWindow extends Window {
  __traceshotOverlayActive?: boolean
}

;(() => {
  const win = window as OverlayWindow
  if (win.__traceshotOverlayActive) return
  win.__traceshotOverlayActive = true

  // Smaller than this is treated as a stray click, not a real region.
  const MIN_SIZE = 5
  const CANCEL_TOAST_MS = 1200

  // Dark theme hardcoded (mirrors index.css): on arbitrary pages we can't read the extension's CSS variables.
  const BRAND = {
    surface: '#16171d',
    border: '#2e303a',
    text: '#d1d5db',
    accent: '#c084fc',
    accentSolid: '#9333ea',
    accentSolidHover: '#a855f7',
    ghostHover: '#1f2028',
    font: 'system-ui, "Segoe UI", Roboto, sans-serif',
  }

  const root = document.createElement('div')
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
  } as Partial<CSSStyleDeclaration>)

  // A single selection box whose huge box-shadow dims everything outside it (Mac cutout look).
  const selection = document.createElement('div')
  Object.assign(selection.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '0',
    height: '0',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    display: 'none',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>)

  // Reused for both the "outside the tab" warning and the "cancelled" toast.
  const notice = document.createElement('div')
  Object.assign(notice.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 12px',
    borderRadius: '8px',
    background: 'rgba(220, 38, 38, 0.95)',
    color: '#fff',
    font: '500 13px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    display: 'none',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  } as Partial<CSSStyleDeclaration>)

  root.appendChild(selection)
  root.appendChild(notice)
  document.documentElement.appendChild(root)

  let startX = 0
  let startY = 0
  let dragging = false
  let rect = { x: 0, y: 0, w: 0, h: 0 }
  let previewCard: HTMLElement | null = null

  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  function updateRect(curX: number, curY: number) {
    rect = {
      x: Math.min(startX, curX),
      y: Math.min(startY, curY),
      w: Math.abs(curX - startX),
      h: Math.abs(curY - startY),
    }
    selection.style.left = `${rect.x}px`
    selection.style.top = `${rect.y}px`
    selection.style.width = `${rect.w}px`
    selection.style.height = `${rect.h}px`
  }

  // --- Selection phase ---------------------------------------------------------

  function addSelectionListeners() {
    root.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('mouseout', onMouseOut, true)
  }

  function removeSelectionListeners() {
    root.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('mouseup', onMouseUp, true)
    window.removeEventListener('mouseout', onMouseOut, true)
  }

  function startSelection() {
    dragging = false
    rect = { x: 0, y: 0, w: 0, h: 0 }
    selection.style.display = 'none'
    notice.style.display = 'none'
    root.style.cursor = 'crosshair'
    root.style.background = 'transparent'
    addSelectionListeners()
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragging = true
    startX = e.clientX
    startY = e.clientY
    selection.style.display = 'block'
    updateRect(e.clientX, e.clientY)
  }

  function onMouseMove(e: MouseEvent) {
    // A move inside the viewport means the cursor is back on the tab; clear the warning.
    notice.style.display = 'none'
    if (!dragging) return
    updateRect(e.clientX, e.clientY)
  }

  // relatedTarget === null means the pointer left the window entirely — the only "outside the tab" we can detect mid-drag.
  function onMouseOut(e: MouseEvent) {
    if (e.relatedTarget !== null) return
    const where = e.clientY <= 0 ? 'browser toolbar' : 'area outside this tab'
    notice.textContent = `Can only capture the current tab, not the ${where}`
    notice.style.display = 'block'
  }

  function onMouseUp() {
    if (!dragging) return
    dragging = false
    const finalRect = rect
    const dpr = window.devicePixelRatio || 1

    if (finalRect.w < MIN_SIZE || finalRect.h < MIN_SIZE) {
      cancel() // a click with no real drag bails out of capture mode
      return
    }

    // Need at least one edge long enough to hold the watermark run; otherwise the id can't be traced.
    if (Math.round(finalRect.w * dpr) < STRIP_PIXELS && Math.round(finalRect.h * dpr) < STRIP_PIXELS) {
      notice.textContent = 'Selection too small to trace — drag a larger area'
      notice.style.display = 'block'
      selection.style.display = 'none'
      return // stay in selection phase (listeners still attached) so the user can re-drag
    }

    removeSelectionListeners()
    selection.style.display = 'none'
    root.style.cursor = 'default'
    captureAndPreview(finalRect, dpr)
  }

  // --- Capture + preview phase -------------------------------------------------

  async function captureAndPreview(finalRect: typeof rect, dpr: number) {
    // Wait for the dim to leave the painted frame before the background captures.
    await nextFrame()
    await nextFrame()

    let res: { imageUrl?: string; id?: string | null; error?: string } | undefined
    try {
      res = await chrome.runtime.sendMessage({ type: 'REGION_SELECTED', rect: finalRect, dpr })
    } catch (error) {
      res = { error: String(error) }
    }

    if (!res?.imageUrl) {
      notice.textContent = 'TraceShot capture failed'
      notice.style.display = 'block'
      setTimeout(teardown, CANCEL_TOAST_MS)
      return
    }
    showPreview(res.imageUrl, res.id ?? null)
  }

  function showPreview(imageUrl: string, id: string | null) {
    root.style.background = 'rgba(0, 0, 0, 0.6)'

    const card = document.createElement('div')
    Object.assign(card.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      padding: '18px',
      maxWidth: '76vw',
      background: BRAND.surface,
      border: `1px solid ${BRAND.border}`,
      borderRadius: '14px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
    } as Partial<CSSStyleDeclaration>)

    const wordmark = document.createElement('div')
    wordmark.textContent = 'TraceShot'
    Object.assign(wordmark.style, {
      font: `600 13px/1 ${BRAND.font}`,
      letterSpacing: '0.3px',
      color: BRAND.accent,
    } as Partial<CSSStyleDeclaration>)

    const img = document.createElement('img')
    img.src = imageUrl
    Object.assign(img.style, {
      display: 'block',
      margin: '0 auto',
      maxWidth: '72vw',
      maxHeight: '58vh',
      objectFit: 'contain',
      borderRadius: '8px',
      border: `1px solid ${BRAND.border}`,
    } as Partial<CSSStyleDeclaration>)

    const btnRow = document.createElement('div')
    Object.assign(btnRow.style, {
      display: 'flex',
      gap: '10px',
      justifyContent: 'flex-end',
    } as Partial<CSSStyleDeclaration>)

    const retakeBtn = makeButton('Retake', 'ghost')
    const confirmBtn = makeButton('Confirm', 'primary')

    retakeBtn.onclick = () => {
      card.remove()
      previewCard = null
      startSelection()
    }
    confirmBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'CONFIRM_SAVE', imageUrl, id })
      teardown()
    }

    btnRow.append(retakeBtn, confirmBtn)
    card.append(wordmark, img, btnRow)
    root.appendChild(card)
    previewCard = card
  }

  function makeButton(label: string, variant: 'primary' | 'ghost'): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = label
    const primary = variant === 'primary'
    const base = primary ? BRAND.accentSolid : 'transparent'
    const hover = primary ? BRAND.accentSolidHover : BRAND.ghostHover
    Object.assign(btn.style, {
      padding: '9px 18px',
      border: primary ? 'none' : `1px solid ${BRAND.border}`,
      borderRadius: '9px',
      background: base,
      color: primary ? '#fff' : BRAND.text,
      font: `500 14px/1 ${BRAND.font}`,
      cursor: 'pointer',
      transition: 'background 120ms ease',
    } as Partial<CSSStyleDeclaration>)
    btn.onmouseenter = () => (btn.style.background = hover)
    btn.onmouseleave = () => (btn.style.background = base)
    return btn
  }

  // --- Teardown / cancel -------------------------------------------------------

  function cancel() {
    removeSelectionListeners()
    dragging = false
    selection.style.display = 'none'
    previewCard?.remove()
    previewCard = null
    root.style.cursor = 'default'
    root.style.background = 'transparent'
    notice.textContent = 'TraceShot cancelled'
    notice.style.display = 'block'
    setTimeout(teardown, CANCEL_TOAST_MS)
  }

  function teardown() {
    root.remove()
    removeSelectionListeners()
    window.removeEventListener('keydown', onKeyDown, true)
    win.__traceshotOverlayActive = false
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel()
  }

  window.addEventListener('keydown', onKeyDown, true)
  startSelection()
})()
