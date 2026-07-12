import { createClient } from '@supabase/supabase-js'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createScreenshot } from '@/lib/db'
import { getURL } from '@/lib/db'
import { isValidScreenshotKey } from '@/lib/types';

export async function POST(request: Request) { //submitting a screenshot
    const startTime = Date.now()
    console.log('[POST /api/screenshots] Request received')

    try {
        const { screenshotId, url } = await request.json()
        console.log('[POST] Extracted params:', { screenshotId, url })

        if (!screenshotId) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Screenshot ID does not exist')
        }
        if (!url) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'URL does not exist')
        }
        if (!isValidScreenshotKey(screenshotId)) throw new ApiError(400, 'INVALID_PARAMETERS', 'Screenshot ID does not follow intended format')

        console.log('[POST] Creating screenshot:', screenshotId)
        const result = await createScreenshot(screenshotId, url)

        const duration = Date.now() - startTime
        console.log('[POST] Success in', duration, 'ms')
        return Response.json(result, { status: 201 })
    }
    catch (error) {
        const duration = Date.now() - startTime
        console.log('[POST] Error after', duration, 'ms:', error instanceof Error ? error.message : error)
        return mapErrorToResponse(error)
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
        return Response.json(result, { status: 200})
    }
    catch (error) {
        const duration = Date.now() - startTime
        console.log('[GET] Error after', duration, 'ms:', error instanceof Error ? error.message : error)
        return mapErrorToResponse(error)
    }
}