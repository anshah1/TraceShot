export const metadata = {
  title: 'Privacy Policy · TraceShot',
  description: 'How TraceShot handles your data.',
}

// TODO: set these before publishing.
const LAST_UPDATED = 'July 22, 2026'
const CONTACT_EMAIL = 'anshs+traceshot@umich.edu'

const css = `
  .privacy { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; }
  .privacy h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.5px; }
  .privacy .updated { color: #6b7280; font-size: 14px; margin: 0 0 32px; }
  .privacy h2 { font-size: 19px; margin: 36px 0 10px; letter-spacing: -0.2px; }
  .privacy p, .privacy li { color: #2b2f36; }
  .privacy ul { padding-left: 22px; margin: 8px 0; }
  .privacy li { margin: 6px 0; }
  .privacy a { color: #2563eb; }
  .privacy strong { color: #111; }
  .privacy .note { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;
    color: #6b7280; font-size: 14px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0d10; }
    .privacy { color: #e6e8eb; }
    .privacy p, .privacy li { color: #c4c8ce; }
    .privacy strong { color: #fff; }
    .privacy .updated, .privacy .note { color: #8b929c; }
    .privacy .note { border-top-color: #23262c; }
    .privacy a { color: #6ea8fe; }
  }
`

export default function PrivacyPage() {
  return (
    <main className="privacy">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <h1>TraceShot Privacy Policy</h1>
      <p className="updated">Last updated: {LAST_UPDATED}</p>

      <p>
        TraceShot is a Chrome extension that captures a region of the page you are viewing, embeds an
        invisible traceable ID into the saved image, and later lets you decode that image to recover the
        URL it came from. This policy explains what data TraceShot collects, why, and how it is handled.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign in with Google, we receive your email address
          and basic Google profile information. We use this solely to create and authenticate your account.
        </li>
        <li>
          <strong>Screenshot metadata.</strong> When you capture a traceable screenshot, we store the
          page&rsquo;s <strong>URL</strong>, <strong>title</strong>, <strong>origin</strong> (scheme and
          domain), a <strong>timestamp</strong>, and the generated <strong>screenshot ID</strong> that is
          embedded in the watermark, linked to your account. This mapping is what lets a decoded watermark
          resolve back to its source URL.
        </li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>
          <strong>We never upload or store your screenshots.</strong> The captured image is saved locally to
          your device (and optionally copied to your clipboard). It never leaves your device.
        </li>
        <li>
          <strong>Decoding happens locally.</strong> Reading a watermark out of an image is done in your
          browser; we only receive the decoded ID in order to look up its URL.
        </li>
        <li>
          We do not collect page content, HTML, cookies, passwords, form inputs, or browsing history.
        </li>
        <li>We do not sell your data or use it for advertising.</li>
      </ul>

      <h2>How your data is stored and shared</h2>
      <p>
        Account and screenshot metadata are stored in a Supabase (PostgreSQL) database and served through
        infrastructure hosted on Vercel. Your authentication token is stored locally on your device in the
        extension&rsquo;s <code>chrome.storage.local</code> and is cleared when you sign out.
      </p>
      <p>
        We share data only with the service providers that operate TraceShot on our behalf &mdash; Google
        (sign-in), Supabase (database), and Vercel (hosting) &mdash; and only as needed to run the service.
        We do not share your data with any other third parties.
      </p>

      <h2>Extension permissions</h2>
      <p>TraceShot requests only the permissions it needs to capture the current page:</p>
      <ul>
        <li><strong>activeTab / tabs / host access</strong> &mdash; to read the current tab&rsquo;s URL and title and capture its visible content when you start a screenshot.</li>
        <li><strong>scripting</strong> &mdash; to draw the region-selection overlay on the current page.</li>
        <li><strong>downloads</strong> &mdash; to save the screenshot to your device.</li>
        <li><strong>clipboardWrite</strong> &mdash; to copy the screenshot or a resolved link when you ask.</li>
        <li><strong>storage</strong> &mdash; to keep you signed in between sessions.</li>
        <li><strong>identity</strong> &mdash; to sign you in with Google.</li>
      </ul>

      <h2>Data retention and deletion</h2>
      <p>
        We retain your account and screenshot metadata until you request its deletion. To delete your account
        or any stored screenshot records, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will remove it.
      </p>

      <h2>Children</h2>
      <p>TraceShot is not directed to children under 13, and we do not knowingly collect their data.</p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be reflected by updating the
        &ldquo;Last updated&rdquo; date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <p className="note">
        TraceShot is open source. You can review exactly what it does at{' '}
        <a href="https://github.com/anshah1/TraceShot" target="_blank" rel="noopener noreferrer">
          github.com/anshah1/TraceShot
        </a>
        .
      </p>
    </main>
  )
}
