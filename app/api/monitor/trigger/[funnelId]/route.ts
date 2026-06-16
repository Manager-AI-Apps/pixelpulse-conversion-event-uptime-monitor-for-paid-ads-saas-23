/**
 * Manual trigger route — POST /api/monitor/trigger/[funnelId]
 *
 * Authenticated endpoint that immediately runs a funnel on demand.
 * Useful after installing the JS snippet or making tracking changes.
 *
 * Auth-gated: requires a valid session cookie.
 * Ownership-gated: verifies the funnel belongs to the authenticated user.
 */

import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { ApiError, handleRoute } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, property } from "@/lib/db/schema";
import { runFunnel } from "@/lib/scheduler";

// ---------------------------------------------------------------------------
// Ownership check
// ---------------------------------------------------------------------------

async function assertFunnelOwnership(
  db: Database,
  userId: string,
  funnelId: string,
): Promise<void> {
  const [fn] = await db
    .select()
    .from(funnel)
    .where(eq(funnel.id, funnelId));

  if (!fn) {
    throw new ApiError("not_found", "Funnel not found.");
  }

  const [prop] = await db
    .select()
    .from(property)
    .where(eq(property.id, fn.propertyId));

  if (!prop || prop.userId !== userId) {
    throw new ApiError("forbidden", "You do not own this funnel.");
  }
}

// ---------------------------------------------------------------------------
// Exported helper — accepts a db parameter so integration tests can inject
// an in-process PGlite db without mocking the module.
// ---------------------------------------------------------------------------

export async function triggerFunnelRun(
  db: Database,
  userId: string,
  funnelId: string,
): Promise<{ ok: true; funnelId: string }> {
  await assertFunnelOwnership(db, userId, funnelId);
  await runFunnel(funnelId, db);
  return { ok: true, funnelId };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ funnelId: string }> };

export const POST = handleRoute(
  async (req: NextRequest, { params }: RouteContext) => {
    const { funnelId } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      throw new ApiError("unauthorized", "You must be signed in.");
    }

    const result = await triggerFunnelRun(appDb, session.user.id, funnelId);
    return NextResponse.json(result);
  },
);
