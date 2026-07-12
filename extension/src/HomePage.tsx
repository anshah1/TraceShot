import { logout } from './auth'
import type { Session } from './types'

export default function HomePage({ session }: { session: Session }) {
  const handleLogout = async () => {
    await logout()
  }

  return (
    <div>
      <h1>TraceShot</h1>
      <p>Logged in as: {session.user.email}</p>
      <button onClick={handleLogout}>Logout</button>
    </div>
  )
}
