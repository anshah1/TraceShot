import { getUserByEmail, createUser } from '@/lib/db'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, user_id } = await request.json()

    if (!email || !user_id) {
      throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Email and user_id are required')
    }

    let user = await getUserByEmail(email)

    if (!user) {
      user = await createUser(email, user_id)
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        user_id: user.user_id,
      },
    }, { status: 200 })
  } catch (error) {
    return mapErrorToResponse(error)
  }
}
