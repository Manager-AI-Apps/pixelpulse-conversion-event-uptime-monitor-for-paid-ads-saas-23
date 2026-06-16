/**
 * Cron route — POST /api/monitor/run
 *
 * Called by the Render cron job (or any scheduler) to:
 *   1. Validate the CRON_SECRET bearer token.
 *   2. Find all due funnels and run them concurrently.
 *   3. Prune rows older than 35 days from monitor_run, step_result, and
 *      ingest_event.
 *
 * Protects against abuse: any request without a valid Authorization header
 * is rejected with 401.
 */

import { type NextRequest, NextResponse } from "next/server";

import { ApiError, handleRoute } from "@/lib/api-error";
import { requireEnv } from "@/lib/env";
import { getDueFunnels, pruneOldRows, runFunnel } from "@/lib/scheduler";

export const GET = handleRoute(async (req: NextRequest) => {
  // Read inside the handler so the env var is resolved at request time
  const cronSecret = requireEnv("CRON_SECRET");
  const authHeader = req.headers.get("authorization") ?? "";

  if (authHeader !== `Bearer ${cronSecret}`) {
    throw new ApiError("unauthorized", "Invalid or missing CRON_SECRET.");
  }

  const dueFunnels = await getDueFunnels();

  const results = await Promise.allSettled(
    dueFunnels.map((f) => runFunnel(f.id)),
  );

  const failed = results.filter((r) => r.status === "rejected").length;

  // Prune old rows regardless of individual run outcomes
  await pruneOldRows();

  return NextResponse.json({
    ok: true,
    ran: dueFunnels.length,
    failed,
  });
});
