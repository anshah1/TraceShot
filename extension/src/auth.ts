import type { Session } from './types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const STORAGE_KEY = 'session'

let authStateCallback: ((session: Session | null) => void) | null = null

async function getSession(): Promise<Session | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as Session | undefined) || null
}

async function setSession(session: Session | null): Promise<void> {
  if (session === null) {
    await chrome.storage.local.remove(STORAGE_KEY)
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: session })
  }
}

const LOGIN_MESSAGE = 'traceshot:login'

// Must run in the service worker, not the popup: the OAuth window closes the non-fullscreen popup mid-flow.
export async function performGoogleLogin(): Promise<Session> {
  const clientId = '245597955683-rotktgpi50ss68fumj7pea9h4t0ecvl4.apps.googleusercontent.com'
  const redirectUrl = 'https://mbokhhoehjbeloagedfljefmlcpcbpio.chromiumapp.org/'
  const scope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&scope=${encodeURIComponent(scope)}`

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  })

  if (!responseUrl) throw new Error('Failed to get auth code from Google')

  const url = new URL(responseUrl)
  const code = url.searchParams.get('code')
  if (!code) throw new Error('No auth code in response')

  // Send code to backend to exchange for session
  const response = await fetch(`${BACKEND_URL}/api/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to exchange code')
  }

  const data = await response.json()
  await setSession(data.session) // an open popup picks this up via storage.onChanged
  return data.session
}

// Call once, from the service worker, to run OAuth on the popup's behalf.
export function registerLoginHandler() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== LOGIN_MESSAGE) return
    performGoogleLogin()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('Login failed:', error)
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Login failed' })
      })
    return true // keep the message channel open for the async response
  })
}

// Delegates login to the worker; if the popup closes mid-flow the worker still stores the session.
export function loginWithGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: LOGIN_MESSAGE }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.ok) resolve()
      else reject(new Error(response?.error || 'Login failed'))
    })
  })
}

export async function logout() {
  try {
    await setSession(null)
    if (authStateCallback) authStateCallback(null)

    await chrome.identity.clearAllCachedAuthTokens()
    await fetch(`${BACKEND_URL}/api/auth/session`, {
      method: 'POST',
    })
  } catch (error) {
    console.error('Logout failed:', error)
  }
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  authStateCallback = callback

  getSession().then((session) => {
    callback(session)
  })

  const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (STORAGE_KEY in changes) {
      callback((changes[STORAGE_KEY].newValue as Session | undefined) || null)
    }
  }

  chrome.storage.onChanged.addListener(handleStorageChange)

  return () => {
    authStateCallback = null
    chrome.storage.onChanged.removeListener(handleStorageChange)
  }
}
