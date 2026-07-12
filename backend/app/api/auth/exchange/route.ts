import { getUserByEmail, createUser } from '@/lib/db'
import { generate7CharId } from '@/lib/id'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code) {
      throw new ApiError(400, 'MISSING_CODE', 'Authorization code is required')
    }

    // Exchange code for access token with Google
    const tokenResponse = await fetch('https://accounts.google.com/o/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_WEB_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_WEB_CLIENT_SECRET || '',
        redirect_uri: 'https://mbokhhoehjbeloagedfljefmlcpcbpio.chromiumapp.org/',
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange error:', tokenResponse.status, errorText)
      throw new ApiError(400, 'TOKEN_EXCHANGE_FAILED', 'Failed to exchange auth code')
    }

    const tokenData = await tokenResponse.json()
    const access_token = tokenData.access_token

    // Get user info from Google
    const googleResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text()
      console.error('Google API error:', googleResponse.status, errorText)
      throw new ApiError(401, 'INVALID_TOKEN', 'Failed to get user info from Google')
    }

    const googleUser = await googleResponse.json()
    const email = googleUser.email

    if (!email) {
      throw new ApiError(400, 'MISSING_EMAIL', 'No email in Google profile')
    }

    // Check if user exists, create if not
    let dbUser = await getUserByEmail(email)
    if (!dbUser) {
      const userId = generate7CharId()
      dbUser = await createUser(email, userId)
    }

    return NextResponse.json(
      {
        session: {
          user: {
            id: dbUser.id,
            email: dbUser.email,
          },
          access_token,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    return mapErrorToResponse(error)
  }
}
