import type { Session } from './types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
let currentSession: Session | null = null
let authStateCallback: ((session: Session | null) => void) | null = null

export async function loginWithGoogle() {
  try {
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
    currentSession = data.session
    if (authStateCallback) authStateCallback(currentSession)
  } catch (error) {
    console.error('Login failed:', error)
    throw error
  }
}

export async function logout() {
  try {
    currentSession = null
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
  callback(currentSession)

  return () => {
    authStateCallback = null
  }
}
