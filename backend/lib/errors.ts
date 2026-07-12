export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string
    ) {
        super(message)
    }
}

export function mapErrorToResponse(error: unknown) {
    if (error instanceof ApiError) {
        return Response.json(
            { error: error.message, code: error.code },
            { status: error.status}
        )
    }
    return Response.json(
        { error: 'Internal server error'},
        { status: 500}
    )
}