/**
 * Integration tests for lib/scheduler.ts
 *
 * Uses an in-process PGlite database so no external Postgres is needed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db";
import { funnel, ingestEvent, monitorRun, property, user } from "@/lib/db/schema";
import { getDueFunnels, pruneOldRows } from "@/lib/scheduler";
import { createTestDb } from "@/tests/helpers/test-db";

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  testDb = await createTestDb();
});

afterEach(async () => {
  await testDb.close();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function insertUser(db: Database) {
  const [u] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: "Test User",
      email: `test-${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return u!;
}

async function insertProperty(db: Database, userId: string) {
  const [p] = await db
    .insert(property)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: "Test Property",
      domain: "example.com",
      snippetKey: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return p!;
}

async function insertFunnel(
  db: Database,
  propertyId: string,
  lastRunAt: Date | null,
  scheduleMinutes = 15,
) {
  const [f] = await db
    .insert(funnel)
    .values({
      id: crypto.randomUUID(),
      propertyId,
      name: "Test Funnel",
      scheduleMinutes,
      lastRunAt,
      createdAt: new Date(),
    })
    .returning();
  return f!;
}

// ── getDueFunnels ─────────────────────────────────────────────────────────────

describe("getDueFunnels", () => {
  it("returns overdue funnels (lastRunAt 20 min ago, scheduleMinutes=15)", async () => {
    const u = await insertUser(testDb.db);
    const p = await insertProperty(testDb.db, u.id);
    // 20 min ago + 15 min window → next run was 5 min ago → due
    const lastRunAt = new Date(Date.now() - 20 * 60 * 1000);
    await insertFunnel(testDb.db, p.id, lastRunAt, 15);

    const due = await getDueFunnels(testDb.db);
    expect(due).toHaveLength(1);
  });

  it("excludes recent funnels (lastRunAt 5 min ago, scheduleMinutes=15)", async () => {
    const u = await insertUser(testDb.db);
    const p = await insertProperty(testDb.db, u.id);
    // 5 min ago + 15 min window → next run is 10 min from now → not due
    const lastRunAt = new Date(Date.now() - 5 * 60 * 1000);
    await insertFunnel(testDb.db, p.id, lastRunAt, 15);

    const due = await getDueFunnels(testDb.db);
    expect(due).toHaveLength(0);
  });

  it("returns funnels that have never been run (lastRunAt IS NULL)", async () => {
    const u = await insertUser(testDb.db);
    const p = await insertProperty(testDb.db, u.id);
    await insertFunnel(testDb.db, p.id, null, 15);

    const due = await getDueFunnels(testDb.db);
    expect(due).toHaveLength(1);
  });
});

// ── pruneOldRows ──────────────────────────────────────────────────────────────

describe("pruneOldRows", () => {
  it("deletes monitor_run rows older than 35 days", async () => {
    const u = await insertUser(testDb.db);
    const p = await insertProperty(testDb.db, u.id);
    const f = await insertFunnel(testDb.db, p.id, null, 15);

    // 36 days ago → older than the 35-day cutoff
    const ranAt = new Date(Date.now() - 36 * 24 * 60 * 60 * 1000);
    await testDb.db.insert(monitorRun).values({
      id: crypto.randomUUID(),
      funnelId: f.id,
      status: "passed",
      ranAt,
    });

    let runs = await testDb.db.select().from(monitorRun);
    expect(runs).toHaveLength(1);

    await pruneOldRows(testDb.db);

    runs = await testDb.db.select().from(monitorRun);
    expect(runs).toHaveLength(0);
  });

  it("preserves monitor_run rows newer than 35 days", async () => {
    const u = await insertUser(testDb.db);
    const p = await insertProperty(testDb.db, u.id);
    const f = await insertFunnel(testDb.db, p.id, null, 15);

    // 34 days ago → within the 35-day retention window
    const ranAt = new Date(Date.now() - 34 * 24 * 60 * 60 * 1000);
    await testDb.db.insert(monitorRun).values({
      id: crypto.randomUUID(),
      funnelId: f.id,
      status: "passed",
      ranAt,
    });

    await pruneOldRows(testDb.db);

    const runs = await testDb.db.select().from(monitorRun);
    expect(runs).toHaveLength(1);
  });

  it("deletes ingest_event rows older than 35 days", async () => {
    const receivedAt = new Date(Date.now() - 36 * 24 * 60 * 60 * 1000);
    await testDb.db.insert(ingestEvent).values({
      id: crypto.randomUUID(),
      snippetKey: "sk-test-xyz",
      eventName: "Purchase",
      payload: {},
      receivedAt,
    });

    let events = await testDb.db.select().from(ingestEvent);
    expect(events).toHaveLength(1);

    await pruneOldRows(testDb.db);

    events = await testDb.db.select().from(ingestEvent);
    expect(events).toHaveLength(0);
  });
});
