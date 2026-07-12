import { createClient } from '@supabase/supabase-js'
import { ApiError, mapErrorToResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createScreenshot } from '@/lib/db'
import { getURL } from '@/lib/db'
import { isValidScreenshotKey } from '@/lib/types';

export async function POST(request: Request) { //submitting a screenshot
    try {
        const { screenshotId, url } = await request.json()
        if (!screenshotId) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Screenshot ID does not exist')
        }
        if (!url) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'URL does not exist')
        }
        if (!isValidScreenshotKey(screenshotId)) throw new ApiError(400, 'INVALID_PARAMETERS', 'Screenshot ID does not follow intended format')
        const result = await createScreenshot(screenshotId, url)
        return Response.json(result, { status: 201 })    
    }
    catch (error) {
        return mapErrorToResponse(error)
    }
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const screenshotId = url.searchParams.get('screenshotId')
        if (!screenshotId) {
            throw new ApiError(400, 'INCOMPLETE_PARAMETERS', 'Screenshot ID does not exist')
        }
        if (!isValidScreenshotKey(screenshotId)) throw new ApiError(400, 'INVALID_PARAMETERS', 'Screenshot ID does not follow intended format')
        const result = await getURL(screenshotId)
        return Response.json(result, { status: 200})
    }
    catch (error) {
        return mapErrorToResponse(error)
    }
}