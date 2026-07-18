import { registerLoginHandler } from './auth'

chrome.runtime.onInstalled.addListener(() => {
  console.log('TraceShot extension installed');
});

// Run the OAuth flow here, not in the popup: the popup closes when the Google
// sign-in window takes focus (non-fullscreen), killing the flow. See auth.ts.
registerLoginHandler();
