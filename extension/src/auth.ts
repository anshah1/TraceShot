import type { Session } from './types'
import { generate7CharId } from './id'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export async function loginWithGoogle() {
  try {
    const token = await chrome.identity.getAuthToken({ interactive: true })
    if (!token) throw new Error('Failed to get auth token')

    const userInfo = await chrome.identity.getProfileUserInfo()
    if (!userInfo.email) throw new Error('Failed to get email')

    let user
    let created = false

    do {
      const userId = generate7CharId()

      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userInfo.email, user_id: userId }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Failed to create/fetch user')
        }

        const data = await response.json()
        user = data.user
        created = true
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate')) {
          continue
        }
        throw error
      }
    } while (!created)

    await chrome.storage.local.set({
      auth: {
        user,
        access_token: token,
      },
    })
  } catch (error) {
    console.error('Login failed:', error)
    throw error
  }
}

export async function logout() {
  await chrome.identity.clearAllCachedAuthTokens()
  await chrome.storage.local.remove('auth')
}

export async function getSession(): Promise<Session | null> {
  const storage = await chrome.storage.local.get('auth')
  return (storage.auth as Session) || null
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  getSession().then(callback)

  const unsubscribe = chrome.storage.onChanged.addListener((changes) => {
    if (changes.auth) {
      callback((changes.auth.newValue as Session) || null)
    }
  })

  return unsubscribe
}
