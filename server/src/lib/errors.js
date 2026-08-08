/**
 * Error shape agreed with the spec:
 *   400 { "error": "...", "code": "..." }  malformed request
 *   404 { "error": "...", "code": "..." }  unknown sessionId on a turn
 * Everything else returns 200 with the interview contract shape.
 */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code, message) => new ApiError(400, code, message);
export const notFound = (code, message) => new ApiError(404, code, message);

export const ErrorCodes = {
  INVALID_BODY: 'INVALID_BODY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  MISSING_CANDIDATE: 'MISSING_CANDIDATE',
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
  MISSING_MESSAGE: 'MISSING_MESSAGE',
  UNKNOWN_SESSION: 'UNKNOWN_SESSION',
  SESSION_EXISTS: 'SESSION_EXISTS',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  INTERNAL: 'INTERNAL',
};
