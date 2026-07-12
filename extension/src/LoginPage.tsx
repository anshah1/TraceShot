import { loginWithGoogle } from './auth'

export default function LoginPage() {
  const handleLogin = async () => {
    try {
      await loginWithGoogle()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  return (
    <div>
      <h1>TraceShot</h1>
      <button onClick={handleLogin}>Login with Google</button>
    </div>
  )
}
