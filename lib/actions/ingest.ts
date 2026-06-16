/**
 * Ingest data-access functions.
 *
 * Each function accepts an optional `db` parameter (defaults to the production
 * db) so integration tests can inject an in-process PGlite db via
 * createTestDb(). All mutations validate the snippetKey exists and enforce a
 * DB-backed rate limit.
 */

import { and, count, eq, gte } from "drizzle-orm";

import { db as appDb, type Database } from "@/lib/db";
import { ingestEvent, property } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";

export type IngestEventRow = typeof ingestEvent.$inferSelect;

/** Max events per snippetKey within the rate-limit window. */
const RATE_LIMIT_MAX = 100;
/** Rate-limit window length in milliseconds (60 seconds). */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Validate, rate-limit, and insert a single ingest event.
 *
 * @throws ApiError("not_found")    if no property matches `snippetKey`.
 * @throws ApiError("rate_limited") if >100 events were received for this
 *                                  snippetKey in the last 60 seconds.
 */
export async function processIngestEvent(
  db: Database = appDb,
  snippetKey: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<IngestEventRow> {
  // 1. Look up property by snippetKey
  const [prop] = await db
    .select({ id: property.id })
    .from(property)
    .where(eq(property.snippetKey, snippetKey))
    .limit(1);

  if (!prop) {
    throw new ApiError(
      "not_found",
      `No property found for snippet key "${snippetKey}".`,
    );
  }

  // 2. DB-backed rate limit: count events for this key in the last 60 s
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const [rateRow] = await db
    .select({ total: count() })
    .from(ingestEvent)
    .where(
      and(
        eq(ingestEvent.snippetKey, snippetKey),
        gte(ingestEvent.receivedAt, since),
      ),
    );

  const recentCount = rateRow?.total ?? 0;
  if (recentCount >= RATE_LIMIT_MAX) {
    throw new ApiError(
      "rate_limited",
      "Rate limit exceeded: maximum 100 events per 60 seconds per snippet key.",
    );
  }

  // 3. Insert the ingest_event row
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(ingestEvent)
    .values({
      id,
      snippetKey,
      eventName,
      payload: payload ?? {},
      receivedAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new ApiError("internal", "Failed to insert ingest event.");
  }

  return row;
}
