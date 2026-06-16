/**
 * Monitor-run data-access functions.
 *
 * Each function accepts a `db` parameter (defaults to the production db) so
 * integration tests can inject an in-process PGlite db via createTestDb().
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, monitorRun, property, stepResult } from "@/lib/db/schema";

export type MonitorRunRow = typeof monitorRun.$inferSelect;
export type StepResultRow = typeof stepResult.$inferSelect;

export type RunWithStepResults = MonitorRunRow & {
  stepResults: StepResultRow[];
};

/** Assert the funnel's property belongs to userId; throws if not. */
async function assertFunnelOwnership(
  db: Database,
  userId: string,
  funnelId: string,
): Promise<void> {
  const [fn] = await db
    .select()
    .from(funnel)
    .where(eq(funnel.id, funnelId));

  if (!fn) throw new Error("Funnel not found.");

  const [prop] = await db
    .select()
    .from(property)
    .where(eq(property.id, fn.propertyId));

  if (!prop || prop.userId !== userId)
    throw new Error("Forbidden: you do not own this funnel.");
}

/**
 * Returns the most recent monitor run for a funnel, including its per-step
 * results.  Returns null if the funnel has never been run.
 */
export async function getLatestRunWithStepResults(
  db: Database = appDb,
  userId: string,
  funnelId: string,
): Promise<RunWithStepResults | null> {
  await assertFunnelOwnership(db, userId, funnelId);

  const [run] = await db
    .select()
    .from(monitorRun)
    .where(eq(monitorRun.funnelId, funnelId))
    .orderBy(desc(monitorRun.ranAt))
    .limit(1);

  if (!run) return null;

  const results = await db
    .select()
    .from(stepResult)
    .where(eq(stepResult.runId, run.id));

  return { ...run, stepResults: results };
}

/**
 * Returns the uptime percentage (0–100) for a funnel over the last `days` days.
 * null if there are no runs in that window.
 */
export async function getUptimePercent(
  db: Database = appDb,
  userId: string,
  funnelId: string,
  days = 30,
): Promise<number | null> {
  await assertFunnelOwnership(db, userId, funnelId);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      status: monitorRun.status,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(monitorRun)
    .where(
      and(eq(monitorRun.funnelId, funnelId), gte(monitorRun.ranAt, since)),
    )
    .groupBy(monitorRun.status);

  if (rows.length === 0) return null;

  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const passed = rows
    .filter((r) => r.status === "passed")
    .reduce((acc, r) => acc + r.count, 0);

  if (total === 0) return null;
  return Math.round((passed / total) * 100);
}
