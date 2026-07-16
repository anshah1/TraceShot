export interface User {
  id: string
  email: string
}

export interface Session {
  user: User
  access_token: string
  expires_at: number
}

export interface Tab {
  url: string
  title: string
  origin: string
}
