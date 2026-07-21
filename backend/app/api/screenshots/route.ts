import { createClient } from '@supabase/supabase-js'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createScreenshot } from '@/lib/db'
import { getURL } from '@/lib/db'
import { isValidScreenshotKey } from '@/lib/types';

const EXTENSION_ORIGIN = process.env.NEXT_PUBLIC_EXTENSION_URL || '*'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': EXTENSION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

// The extension calls this route from a chrome-extension:// origin, so every response (and the POST preflight) needs CORS headers.
function withCors(response: Response): Response {
    for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value)
    return response
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) { //submitting a screenshot
    const startTime = Date.now()
    console.log('[POST /api/screenshots] Request received')

    try {
        const { screenshotId, url, title, origin } = await request.json()
        console.log('[POST] Extracted params:', { screenshotId, url, title, origin })

        if (!screenshotId) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Screenshot ID does not exist')
        }
        if (!url) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'URL does not exist')
        }
        if (!title) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Title does not exist')
        }
        if (!origin) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Origin does not exist')
        }
        if (!isValidScreenshotKey(screenshotId)) throw new ApiError(400, 'INVALID_PARAMETERS', 'Screenshot ID does not follow intended format')

        console.log('[POST] Creating screenshot:', screenshotId)
        const result = await createScreenshot(screenshotId, url, title, origin)

        const duration = Date.now() - startTime
        console.log('[POST] Success in', duration, 'ms')
        return withCors(Response.json(result, { status: 201 }))
    }
    catch (error) {
        const duration = Date.now() - startTime
        console.log('[POST] Error after', duration, 'ms:', error instanceof Error ? error.message : error)
        return withCors(mapErrorToResponse(error))
    }
}

export async function GET(request: Request) {
    const startTime = Date.now()
    console.log('[GET /api/screenshots] Request received')

    try {
        const url = new URL(request.url)
        const screenshotId = url.searchParams.get('screenshotId')
        console.log('[GET] Screenshot ID:', screenshotId)

        if (!screenshotId) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Screenshot ID does not exist')
        }
        if (!isValidScreenshotKey(screenshotId)) throw new ApiError(400, 'INVALID_PARAMETERS', 'Screenshot ID does not follow intended format')

        console.log('[GET] Fetching URL for:', screenshotId)
        const result = await getURL(screenshotId)

        const duration = Date.now() - startTime
        console.log('[GET] Success in', duration, 'ms')
        return withCors(Response.json(result, { status: 200}))
    }
    catch (error) {
        const duration = Date.now() - startTime
        console.log('[GET] Error after', duration, 'ms:', error instanceof Error ? error.message : error)
        return withCors(mapErrorToResponse(error))
    }
}