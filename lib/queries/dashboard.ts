/**
 * Dashboard query functions.
 *
 * getPropertyStats — aggregates monitor_run rows for all of a user's properties
 * over a rolling window and returns per-property uptime %, run counts, and the
 * most recent failure diagnosis.
 *
 * The `db` parameter defaults to the shared app DB so callers in route handlers
 * need not pass it. Tests pass a pglite test db instead.
 */

import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, monitorRun, property } from "@/lib/db/schema";

export type PropertyStat = {
  propertyId: string;
  propertyName: string;
  domain: string;
  /**
   * Percentage of monitor_runs that passed in the given window.
   * null when no runs exist in the window.
   */
  uptimePct: number | null;
  /** Total number of monitor_runs in the window across all funnels. */
  totalRuns: number;
  /**
   * Diagnosis text from the most recent failed/errored run (any time).
   * null when no diagnosed failure exists.
   */
  lastDiagnosis: string | null;
};

/**
 * Return uptime statistics for every property owned by `userId`,
 * computed from monitor_run rows within the past `days` days.
 *
 * @param userId  The authenticated user's ID.
 * @param days    Rolling window in days (e.g. 7 or 30).
 * @param db      Drizzle DB instance — defaults to the app DB.
 */
export async function getPropertyStats(
  userId: string,
  days: number,
  db: Database = appDb,
): Promise<PropertyStat[]> {
  // 1. Fetch all properties for the user.
  const properties = await db
    .select({
      id: property.id,
      name: property.name,
      domain: property.domain,
    })
    .from(property)
    .where(eq(property.userId, userId));

  if (properties.length === 0) return [];

  const propertyIds = properties.map((p) => p.id);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);

  // 2. Aggregate run counts per property within the rolling window.
  //    LEFT JOIN ensures properties with funnels but no recent runs return 0.
  const uptimeStats = await db
    .select({
      propertyId: funnel.propertyId,
      totalRuns: count(monitorRun.id),
      // SUM with CASE: returns 0 (not NULL) when the left join produces NULL rows.
      passedRuns: sql<number | null>`CAST(SUM(CASE WHEN ${monitorRun.status} = 'passed' THEN 1 ELSE 0 END) AS INTEGER)`,
    })
    .from(funnel)
    .leftJoin(
      monitorRun,
      and(
        eq(monitorRun.funnelId, funnel.id),
        gte(monitorRun.ranAt, cutoff),
      ),
    )
    .where(inArray(funnel.propertyId, propertyIds))
    .groupBy(funnel.propertyId);

  // 3. Fetch the most recent diagnosed failure per property (any time window).
  const diagnosisRows = await db
    .select({
      propertyId: funnel.propertyId,
      diagnosis: monitorRun.diagnosis,
    })
    .from(funnel)
    .innerJoin(monitorRun, eq(monitorRun.funnelId, funnel.id))
    .where(
      and(
        inArray(funnel.propertyId, propertyIds),
        isNotNull(monitorRun.diagnosis),
      ),
    )
    .orderBy(desc(monitorRun.ranAt));

  // Build last-diagnosis map — first row per property is the most recent.
  const lastDiagMap = new Map<string, string>();
  for (const row of diagnosisRows) {
    if (!lastDiagMap.has(row.propertyId) && row.diagnosis !== null && row.diagnosis !== undefined) {
      lastDiagMap.set(row.propertyId, row.diagnosis);
    }
  }

  // Build uptime map keyed by propertyId.
  const uptimeMap = new Map(uptimeStats.map((s) => [s.propertyId, s]));

  // Merge property list with aggregated stats.
  return properties.map((p) => {
    const stat = uptimeMap.get(p.id);
    // totalRuns may come back as a string from the pg driver; coerce to number.
    const totalRuns = stat !== undefined ? Number(stat.totalRuns) : 0;
    const passedRuns = stat !== undefined ? Number(stat.passedRuns ?? 0) : 0;
    return {
      propertyId: p.id,
      propertyName: p.name,
      domain: p.domain,
      uptimePct: totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : null,
      totalRuns,
      lastDiagnosis: lastDiagMap.get(p.id) ?? null,
    };
  });
}
