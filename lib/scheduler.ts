/**
 * Scheduler — finds due funnels and runs them.
 *
 * getDueFunnels: returns all funnels where lastRunAt IS NULL or more than
 * scheduleMinutes minutes have elapsed since the last run.
 *
 * runFunnel: fetches all steps, calls analyzeStep per step, writes one
 * monitor_run row + per-step step_result rows, and updates funnel.lastRunAt.
 * Each invocation has an internal 30-second timeout.
 *
 * pruneOldRows: deletes monitor_run, step_result (cascade), and ingest_event
 * rows older than 35 days.
 */

import { eq, lt, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import {
  funnel,
  funnelStep,
  ingestEvent,
  monitorRun,
  stepResult,
} from "@/lib/db/schema";
import { analyzeStep } from "@/lib/pixel-analyzer";
import type { ExpectedEvent } from "@/lib/pixel-analyzer";

export type FunnelRow = typeof funnel.$inferSelect;

// ---------------------------------------------------------------------------
// getDueFunnels
// ---------------------------------------------------------------------------

/**
 * Returns every funnel that is due to run: either it has never run
 * (lastRunAt IS NULL) or the scheduled interval has elapsed since the last run.
 */
export async function getDueFunnels(db: Database = appDb): Promise<FunnelRow[]> {
  return db.select().from(funnel).where(
    sql`${funnel.lastRunAt} IS NULL OR ${funnel.lastRunAt} + (${funnel.scheduleMinutes} * interval '1 minute') <= now()`,
  );
}

// ---------------------------------------------------------------------------
// runFunnel
// ---------------------------------------------------------------------------

/**
 * Execute a single funnel run:
 * 1. Fetch steps ordered by stepOrder.
 * 2. Analyze each step via analyzeStep.
 * 3. Insert one monitor_run row and one step_result row per step.
 * 4. Set funnel.lastRunAt = now().
 *
 * Wrapped in a 30-second Promise.race timeout; rejects if the work takes
 * longer than 30 s.
 */
export async function runFunnel(
  funnelId: string,
  db: Database = appDb,
): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`runFunnel timeout (30s): ${funnelId}`)), 30_000),
  );

  await Promise.race([_runFunnelInternal(funnelId, db), timeout]);
}

async function _runFunnelInternal(
  funnelId: string,
  db: Database,
): Promise<void> {
  const startedAt = Date.now();

  // Load steps
  const steps = await db
    .select()
    .from(funnelStep)
    .where(eq(funnelStep.funnelId, funnelId))
    .orderBy(funnelStep.stepOrder);

  const runId = crypto.randomUUID();

  // Analyze each step sequentially (maintaining dedup context per funnel run)
  const stepResults: Array<{
    stepId: string;
    passed: boolean;
    firedEvents: unknown[];
    diagnosis: string | null;
  }> = [];

  let overallPassed = true;
  let overallDiagnosis: string | null = null;

  for (const step of steps) {
    const expectedEvents = Array.isArray(step.expectedEvents)
      ? (step.expectedEvents as ExpectedEvent[])
      : [];

    try {
      const result = await analyzeStep({ url: step.url, expectedEvents });

      stepResults.push({
        stepId: step.id,
        passed: result.passed,
        firedEvents: result.firedEvents as unknown[],
        diagnosis: result.diagnosis,
      });

      if (!result.passed) {
        overallPassed = false;
        if (result.diagnosis !== null && overallDiagnosis === null) {
          overallDiagnosis = result.diagnosis;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      stepResults.push({
        stepId: step.id,
        passed: false,
        firedEvents: [],
        diagnosis: message,
      });

      overallPassed = false;
      if (overallDiagnosis === null) {
        overallDiagnosis = message;
      }
    }
  }

  const durationMs = Date.now() - startedAt;

  // Write monitor_run
  await db.insert(monitorRun).values({
    id: runId,
    funnelId,
    status: overallPassed ? "passed" : "failed",
    diagnosis: overallDiagnosis,
    ranAt: new Date(),
    durationMs,
  });

  // Write step_result rows
  for (const sr of stepResults) {
    await db.insert(stepResult).values({
      id: crypto.randomUUID(),
      runId,
      stepId: sr.stepId,
      passed: sr.passed,
      firedEvents: sr.firedEvents,
      diagnosis: sr.diagnosis,
      createdAt: new Date(),
    });
  }

  // Update funnel.lastRunAt
  await db
    .update(funnel)
    .set({ lastRunAt: new Date() })
    .where(eq(funnel.id, funnelId));
}

// ---------------------------------------------------------------------------
// pruneOldRows
// ---------------------------------------------------------------------------

/**
 * Delete rows older than 35 days from:
 * - monitor_run  (step_result rows cascade automatically via FK)
 * - ingest_event
 */
export async function pruneOldRows(db: Database = appDb): Promise<void> {
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  await Promise.all([
    db.delete(monitorRun).where(lt(monitorRun.ranAt, cutoff)),
    db.delete(ingestEvent).where(lt(ingestEvent.receivedAt, cutoff)),
  ]);
}
