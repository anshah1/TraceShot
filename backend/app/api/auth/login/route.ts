import { createClient } from '@supabase/supabase-js'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.SUPABASE_PROJECT_URL
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: Request) {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/callback`,
      },
    })

    if (error) {
      throw new ApiError(400, 'OAUTH_ERROR', error.message)
    }

    return NextResponse.json({ loginUrl: data.url }, { status: 200 })
  } catch (error) {
    return mapErrorToResponse(error)
  }
}
