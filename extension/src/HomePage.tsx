import { useEffect, useState } from 'react'
import { logout } from './auth'
import type { Session } from './types'
import HelpModal from './HelpModal'
import { DEFAULT_SAVE_LOCATION, formatSaveLocation, getSaveLocationName, pickSaveLocation } from './screenshotLocation'
import './HomePage.css'

export default function HomePage({ session }: { session: Session }) {
  const [isDragging, setIsDragging] = useState(false)
  const [retrievedLink, setRetrievedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saveLocation, setSaveLocation] = useState(DEFAULT_SAVE_LOCATION)

  useEffect(() => {
    getSaveLocationName().then(setSaveLocation)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  // TODO: decode watermark + resolve via backend; returns null until wired
  const resolveLink = async (_file: File): Promise<string | null> => {
    return null
  }

  // TODO: capture region, then save (via getSaveDirectoryHandle(), or default download when null) + copy
  const handleScreenshot = () => {}

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setRetrievedLink(await resolveLink(file))
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    setRetrievedLink(await resolveLink(file))
  }

  const handleCopyLink = async () => {
    if (!retrievedLink) return
    await navigator.clipboard.writeText(retrievedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleChangeLocation = async () => {
    const name = await pickSaveLocation()
    if (name) setSaveLocation(name)
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

        {retrievedLink && (
          <div className="link-result">
            <code className="link-url">{retrievedLink}</code>
            <button className="btn-secondary link-copy" onClick={handleCopyLink}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
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
          <span className="location-path" title={saveLocation}>
            {formatSaveLocation(saveLocation)}
          </span>
          <button className="btn-secondary location-change" onClick={handleChangeLocation}>
            Change
          </button>
        </div>
      </section>
    </main>
  )
}
