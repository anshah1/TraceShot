import { useRef } from 'react'
import './HelpModal.css'

// Trigger anchors to the nearest positioned ancestor — page roots need position: relative
export default function HelpModal() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const open = () => dialogRef.current?.showModal()
  const close = () => dialogRef.current?.close()

  // <dialog> has no native backdrop-click close; the backdrop is the dialog element itself
  const handleDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) close()
  }

  return (
    <>
      <button className="help-trigger" onClick={open} aria-label="How TraceShot works">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17" r="1.1" fill="currentColor" />
        </svg>
      </button>

      <dialog ref={dialogRef} className="help-dialog" onClick={handleDialogClick} aria-labelledby="help-title">
        <div className="help-panel">
          <header className="help-header">
            <h2 id="help-title" className="help-title">
              How <span className="help-brand">TraceShot</span> works
            </h2>
            <button className="help-close" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="help-body">
            <p className="help-text">
              <strong>capture → watermark → decode</strong> flow.
            </p>
            <p className="help-text">
              Watermark may not work on{' '} <strong>non-solid backgrounds</strong>.
            </p>
            <p className="help-text">
              TraceShot is <strong>open source</strong> and contributions are welcome. File issues or open a PR on GitHub.
            </p>
            <a className="help-github" href="https://github.com/anshah1/TraceShot" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.34 9.34 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </dialog>
    </>
  )
}
