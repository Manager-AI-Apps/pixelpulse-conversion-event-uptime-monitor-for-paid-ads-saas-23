/**
 * Integration tests for POST /api/monitor/trigger/[funnelId]
 *
 * Two tests:
 * 1. Valid session → runFunnel executes and inserts a monitor_run row.
 * 2. Wrong owner  → route returns HTTP 403.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { createTestDb } from "@/tests/helpers/test-db";
import type { Database } from "@/lib/db";
import {
  user,
  property,
  funnel,
  funnelStep,
  monitorRun,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Module-level testDb ref — the getter in the mock reads this at call-time
// ---------------------------------------------------------------------------
let testDb: Awaited<ReturnType<typeof createTestDb>>;

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamicimport of the module under test
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/pixel-analyzer", () => ({
  analyzeStep: vi.fn().mockResolvedValue({
    passed: true,
    firedEvents: [],
    diagnosis: null,
  }),
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

// Getter approach: appDb is accessed *at call time* — after testDb is set.
vi.mock("@/lib/db", () => ({
  get db() {
    return (testDb as { db: Database } | undefined)?.db;
  },
}));

// ---------------------------------------------------------------------------
// Helpers to seed the test database
// ---------------------------------------------------------------------------
async function seedData(db: Database, ownerUserId: string) {
  const propertyId = crypto.randomUUID();
  const funnelId = crypto.randomUUID();
  const stepId = crypto.randomUUID();

  await db.insert(user).values({
    id: ownerUserId,
    name: "Test Owner",
    email: `owner-${ownerUserId}@test.local`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(property).values({
    id: propertyId,
    userId: ownerUserId,
    name: "Test Property",
    domain: "test.local",
    snippetKey: `key-${propertyId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(funnel).values({
    id: funnelId,
    propertyId,
    name: "Test Funnel",
    scheduleMinutes: 15,
    createdAt: new Date(),
  });

  await db.insert(funnelStep).values({
    id: stepId,
    funnelId,
    stepOrder: 1,
    url: "https://test.local/signup",
    actionType: "click",
    expectedEvents: [],
    createdAt: new Date(),
  });

  return { propertyId, funnelId, stepId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  mockGetSession.mockReset();
});

afterEach(async () => {
  await testDb.close();
});

describe("POST /api/monitor/trigger/[funnelId]", () => {
  it("trigger runs funnel and returns result — inserts a monitor_run row", async () => {
    const ownerUserId = crypto.randomUUID();
    const { funnelId } = await seedData(testDb.db, ownerUserId);

    mockGetSession.mockResolvedValue({
      user: { id: ownerUserId, name: "Test Owner", email: "owner@test.local" },
    });

    // Dynamically import AFTER mocks are registered
    const { POST } = await import("./route");

    const req = new NextRequest(
      `http://localhost/api/monitor/trigger/${funnelId}`,
      { method: "POST" },
    );
    const res = await POST(req, {
      params: Promise.resolve({ funnelId }),
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; funnelId: string };
    expect(body.ok).toBe(true);
    expect(body.funnelId).toBe(funnelId);

    // A monitor_run row must exist for the funnel
    const runs = await testDb.db
      .select()
      .from(monitorRun)
      .where(eq(monitorRun.funnelId, funnelId));
    expect(runs).toHaveLength(1);
  });

  it("trigger rejects wrong owner — returns 403", async () => {
    const ownerUserId = crypto.randomUUID();
    const wrongUserId = crypto.randomUUID();
    const { funnelId } = await seedData(testDb.db, ownerUserId);

    // Insert a second user so session is valid but wrong
    await testDb.db.insert(user).values({
      id: wrongUserId,
      name: "Wrong User",
      email: `wrong-${wrongUserId}@test.local`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockGetSession.mockResolvedValue({
      user: {
        id: wrongUserId,
        name: "Wrong User",
        email: "wrong@test.local",
      },
    });

    const { POST } = await import("./route");

    const req = new NextRequest(
      `http://localhost/api/monitor/trigger/${funnelId}`,
      { method: "POST" },
    );
    const res = await POST(req, {
      params: Promise.resolve({ funnelId }),
    });

    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});
