/**
 * POST /api/ingest
 *
 * Accepts { key, eventName, payload } from a JS snippet or direct call.
 * - 404 if no property matches the snippetKey.
 * - 429 if the DB-backed rate limit (>100 events / 60 s) is exceeded.
 * - 201 with { ok: true, id } on success.
 *
 * CORS headers are included so customer websites can POST to this endpoint
 * from a browser.
 */

import { NextRequest, NextResponse } from "next/server";

import { handleRoute, ApiError } from "@/lib/api-error";
import { processIngestEvent } from "@/lib/actions/ingest";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Handle CORS pre-flight requests. */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export const POST = handleRoute(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("bad_request", "Request body must be valid JSON.");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("bad_request", "Request body must be a JSON object.");
  }

  const { key, eventName, payload } = body as Record<string, unknown>;

  if (!key || typeof key !== "string" || !key.trim()) {
    throw new ApiError("bad_request", '"key" (snippetKey) is required.');
  }
  if (!eventName || typeof eventName !== "string" || !eventName.trim()) {
    throw new ApiError("bad_request", '"eventName" is required.');
  }

  const safePayload =
    payload !== null &&
    payload !== undefined &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const row = await processIngestEvent(
    undefined,
    key.trim(),
    eventName.trim(),
    safePayload,
  );

  return NextResponse.json(
    { ok: true, id: row.id },
    { status: 201, headers: CORS_HEADERS },
  );
});
