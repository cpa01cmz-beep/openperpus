import { NextResponse } from 'next/server';

/** Error JSON konsisten mengikuti docs/api-contract.md:
 * { "error": { "code": "FORBIDDEN", "message": "..." }, "details"?: ... } */
export function jsonError(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: { code, message } } : { error: { code, message }, details },
    { status }
  );
}

/** Alias lama (string-only) tetap didukung bila ada pemanggil lama. */
export function jsonErrorMsg(message: string, status = 400, details?: unknown) {
  return jsonError('BAD_REQUEST', message, status, details);
}
