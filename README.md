# TraceShot

TraceShot is a Chrome extension that makes screenshots traceable. When you capture a
screenshot, it embeds an invisible ID into the image. Later, you can drop that screenshot
back into TraceShot and it will tell you the URL the screenshot was taken from, even after
the image has been shared around.

## How it works

Every screenshot is assigned a random ID. That ID is embedded into the image as a subtle
watermark painted along the border, so it survives normal sharing (iMessage, Slack, email,
Discord) but stays invisible in everyday use. The extension stores a mapping from the ID to
the page's URL, title, and origin.

To trace an image, you drop it into the extension. The watermark is decoded locally in the
browser to recover the ID, and the backend resolves that ID back to the original URL.

The screenshot itself never leaves your device. Only metadata (the URL and the ID) is stored.

## Repository layout

This is a monorepo with two parts:

- `extension/` — the Chrome extension (frontend)
- `backend/` — the API and database (backend)

Each directory has its own `package.json` and setup.

### Extension

Built with React and Vite as a Manifest V3 extension. It contains the popup UI, a service
worker, and a content script that draws the region-selection overlay on the page. It handles
Google sign-in, tab capture, watermark encoding when saving a screenshot, and watermark
decoding when resolving one.

### Backend

A Next.js app that exposes the API and talks to a Supabase (PostgreSQL) database. It handles
the Google OAuth exchange, stores screenshot metadata and user records, and resolves a
watermark ID back to its source URL.

## License

TraceShot is open source under the MIT License. See [LICENSE](LICENSE).
