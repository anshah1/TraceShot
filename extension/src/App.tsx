import { useEffect, useState } from 'react'
import type { Session } from './types'
import { onAuthStateChange } from './auth'
import LoginPage from './LoginPage'
import HomePage from './HomePage'
import './App.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChange((newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => unsubscribe?.()
  }, [])

  if (loading) return <div>Loading</div>

  return session ? <HomePage /> : <LoginPage />
}
