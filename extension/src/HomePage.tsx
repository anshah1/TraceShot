import { useEffect, useState } from 'react'
import { logout } from './auth'
import type { Session } from './types'
import HelpModal from './HelpModal'
import { DEFAULT_SUBFOLDER, formatSaveLocation, getSaveSubfolder, setSaveSubfolder } from './screenshotLocation'
import { readFrameId } from './watermark'
import './HomePage.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const RESOLVE_TIMEOUT_MS = 8000

type ResolveOutcome =
  | { status: 'resolved'; link: string }
  | { status: 'no-watermark' }
  | { status: 'unreadable' }
  | { status: 'server-error' }
  | { status: 'offline' }
  | { status: 'timeout' }

type ResolveState = { status: 'idle' } | { status: 'resolving' } | ResolveOutcome

const RESOLVE_ERRORS: Record<ResolveOutcome['status'], string> = {
  resolved: '',
  'no-watermark': 'No TraceShot watermark found in this image.',
  unreadable: "Couldn't read that file — try dropping a PNG screenshot.",
  'server-error': 'Server error resolving this link. Please try again.',
  offline: "Can't reach the TraceShot server — is the backend running?",
  timeout: 'The server took too long to respond. Please try again.',
}

type CaptureStart = { ok: true } | { ok: false; reason: 'no-tab' | 'restricted' | 'local-file' }

const CAPTURE_ERRORS: Record<'no-tab' | 'restricted' | 'local-file', string> = {
  'no-tab': 'No active tab to capture.',
  restricted: "This page can't be captured — try a normal website (browser and Web Store pages are blocked).",
  'local-file': "Local files can't be traced — they have no shareable URL. Open the page online instead.",
}

export default function HomePage({ session }: { session: Session }) {
  const [isDragging, setIsDragging] = useState(false)
  const [resolve, setResolve] = useState<ResolveState>({ status: 'idle' })
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [saveLocation, setSaveLocation] = useState(DEFAULT_SUBFOLDER)
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationDraft, setLocationDraft] = useState(DEFAULT_SUBFOLDER)

  useEffect(() => {
    getSaveSubfolder().then(setSaveLocation)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  // Decode the watermark id from the dropped image, then resolve it via the backend. Each stage maps to
  // a distinct outcome so an unreadable file, a missing watermark, and an unreachable server stay separable.
  const resolveLink = async (file: File): Promise<ResolveOutcome> => {
    let data: Uint8ClampedArray, width: number, height: number
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return { status: 'unreadable' }
      ctx.drawImage(bitmap, 0, 0)
      ;({ data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height))
    } catch (error) {
      console.error('Failed to read image:', error)
      return { status: 'unreadable' }
    }

    const id = readFrameId(data, width, height)
    if (!id) return { status: 'no-watermark' }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
    try {
      const res = await fetch(`${BACKEND_URL}/api/screenshots?screenshotId=${id}`, { signal: controller.signal })
      // 404 = id not in our records; for a dropped image that's overwhelmingly a false-positive decode, so treat it as "no watermark".
      if (res.status === 404) return { status: 'no-watermark' }
      if (!res.ok) return { status: 'server-error' }
      return { status: 'resolved', link: await res.json() }
    } catch (error) {
      console.error('Failed to resolve link:', error)
      return { status: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'offline' }
    } finally {
      clearTimeout(timeout)
    }
  }

  // Drive the shared resolve → UI-status transition for both drop and file-picker inputs.
  const resolveFile = async (file: File) => {
    setResolve({ status: 'resolving' })
    setResolve(await resolveLink(file))
  }

  // Hand off to the worker (only it can capture) and await it, so a cold-started worker gets the message before the popup closes.
  const handleScreenshot = async () => {
    setCaptureError(null)
    let res: CaptureStart | undefined
    try {
      res = await chrome.runtime.sendMessage({ type: 'START_CAPTURE' })
    } catch (error) {
      console.error('Failed to start capture:', error)
      setCaptureError('Something went wrong starting capture. Please try again.')
      return
    }
    if (res?.ok) {
      window.close() // overlay took over the tab; the popup can go
      return
    }
    setCaptureError(CAPTURE_ERRORS[res?.reason ?? 'restricted'])
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await resolveFile(file)
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    await resolveFile(file)
  }

  const handleCopyLink = async () => {
    if (resolve.status !== 'resolved') return
    try {
      await navigator.clipboard.writeText(resolve.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.error('Clipboard copy failed:', error)
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 1500)
    }
  }

  // Open the resolved link in a new tab, but only for http(s) — the URL comes from a decoded
  // watermark, so we refuse other schemes (javascript:, data:, file:) as defense-in-depth.
  const handleOpenLink = () => {
    if (resolve.status !== 'resolved') return
    let safe: URL
    try {
      safe = new URL(resolve.link)
    } catch {
      return
    }
    if (safe.protocol !== 'http:' && safe.protocol !== 'https:') return
    window.open(safe.href, '_blank', 'noopener,noreferrer')
  }

  const handleStartEditLocation = () => {
    setLocationDraft(saveLocation)
    setEditingLocation(true)
  }

  const handleSaveLocation = async () => {
    const clean = await setSaveSubfolder(locationDraft)
    setSaveLocation(clean)
    setEditingLocation(false)
  }

  return (
    <main className="home">
      <HelpModal />

      <header className="home-bar">
        <span className="home-wordmark">TraceShot</span>
        <div className="home-account">
          <span className="home-email" title={session.user.email}>
            {session.user.email}
          </span>
          <button className="btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <button className="btn-primary home-capture" onClick={handleScreenshot}>
        <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="home-capture-label">
          Capture screenshot
          <span className="home-capture-sub">Select a region to trace &amp; copy</span>
        </span>
      </button>

      {captureError && <p className="link-status link-status-error home-capture-error">{captureError}</p>}

      <section className="home-section" aria-labelledby="retrieve-heading">
        <h2 id="retrieve-heading" className="home-section-title">
          Retrieve a link
        </h2>

        <label
          className={`dropzone${isDragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            className="dropzone-input"
            onChange={handleFileSelect}
          />
          <svg className="icon dropzone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15V4m0 0 4 4m-4-4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <p className="dropzone-text">
            <strong>Drop an image</strong> or click to upload
          </p>
          <p className="dropzone-hint">Traced screenshots resolve to their source URL</p>
        </label>

        {resolve.status === 'resolving' && <p className="link-status">Decoding screenshot…</p>}

        {resolve.status === 'resolved' ? (
          <div className="link-result">
            <code className="link-url">{resolve.link}</code>
            <button className="btn-secondary link-open" onClick={handleOpenLink}>
              Open
            </button>
            <button
              className={`btn-secondary link-copy${copyFailed ? ' link-copy-failed' : ''}`}
              onClick={handleCopyLink}
            >
              {copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          resolve.status !== 'idle' &&
          resolve.status !== 'resolving' && (
            <p className="link-status link-status-error">{RESOLVE_ERRORS[resolve.status]}</p>
          )
        )}
      </section>

      <section className="home-section" aria-labelledby="location-heading">
        <h2 id="location-heading" className="home-section-title">
          Save location
        </h2>
        <div className="location-row">
          <svg className="icon location-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          {editingLocation ? (
            <>
              <span className="location-prefix">Downloads/</span>
              <input
                className="location-input"
                type="text"
                value={locationDraft}
                autoFocus
                placeholder="blank = Downloads root"
                onChange={(e) => setLocationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLocation()
                  if (e.key === 'Escape') setEditingLocation(false)
                }}
              />
              <button className="btn-secondary location-change" onClick={handleSaveLocation}>
                Save
              </button>
            </>
          ) : (
            <>
              <span className="location-path" title={formatSaveLocation(saveLocation)}>
                {formatSaveLocation(saveLocation)}
              </span>
              <button className="btn-secondary location-change" onClick={handleStartEditLocation}>
                Change
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
