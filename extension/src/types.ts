export interface User {
  id: string
  email: string
  userId: string // 7-char [a-p] id; prepended to a screenshot id to form the 14-char watermark key
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
