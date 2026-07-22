import { createClient } from '@supabase/supabase-js'
import { getUserByEmail, createUser } from '@/lib/db'
import { generate7CharId } from '@/lib/id'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.SUPABASE_PROJECT_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
      throw new ApiError(400, 'MISSING_CODE', 'Authorization code is required')
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      throw new ApiError(400, 'CODE_EXCHANGE_ERROR', error.message)
    }

    const { session, user } = data

    if (!user?.email) {
      throw new ApiError(400, 'MISSING_EMAIL', 'User email not found')
    }

    // Check if user exists in our database, create if not
    let dbUser = await getUserByEmail(user.email)
    if (!dbUser) {
      const userId = generate7CharId()
      dbUser = await createUser(user.email, userId)
    }

    // Create response
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_EXTENSION_URL}?session_created=true`,
      { status: 302 }
    )

    // Set secure httpOnly cookie with access token
    response.cookies.set({
      name: 'auth_token',
      value: session.access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error) {
    return mapErrorToResponse(error)
  }
}
