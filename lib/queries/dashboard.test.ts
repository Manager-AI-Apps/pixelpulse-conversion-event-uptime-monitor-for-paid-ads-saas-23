/**
 * Acceptance tests for task-4-2: dashboard query and dashboard page rendering.
 *
 * 1. Integration: getPropertyStats returns uptimePct=80 for 30d window (8 pass / 2 fail)
 * 2. Integration: getPropertyStats returns uptimePct=null and lastDiagnosis=null when no runs
 * 3. Unit: DashboardContent renders uptime % and the 'ad spend at risk' callout
 */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, property, funnel, monitorRun } from "@/lib/db/schema";
import { getPropertyStats } from "@/lib/queries/dashboard";
import type { PropertyStat } from "@/lib/queries/dashboard";
import { DashboardContent } from "@/app/dashboard/_components/dashboard-content";

// ---------------------------------------------------------------------------
// Integration tests — getPropertyStats
// ---------------------------------------------------------------------------

describe("getPropertyStats", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("returns uptimePct=80 for 30d window with 8 pass / 2 fail out of 10 runs", async () => {
    const now = new Date();

    // Seed: user → property → funnel → 10 monitor_runs
    await testDb.db.insert(user).values({
      id: "u1",
      name: "Test User",
      email: "test@example.com",
    });

    await testDb.db.insert(property).values({
      id: "p1",
      userId: "u1",
      name: "My Site",
      domain: "mysite.com",
      snippetKey: "snippet-abc-111",
    });

    await testDb.db.insert(funnel).values({
      id: "f1",
      propertyId: "p1",
      name: "Checkout Funnel",
    });

    type RunInsert = typeof monitorRun.$inferInsert;

    const runs: RunInsert[] = [
      ...Array.from({ length: 8 }, (_, i): RunInsert => ({
        id: `run-pass-${i}`,
        funnelId: "f1",
        status: "passed",
        ranAt: new Date(now.getTime() - (i + 1) * 3_600_000),
      })),
      {
        id: "run-fail-1",
        funnelId: "f1",
        status: "failed",
        ranAt: new Date(now.getTime() - 2 * 3_600_000),
        diagnosis: "Purchase fired without value",
      },
      {
        id: "run-fail-2",
        funnelId: "f1",
        status: "failed",
        ranAt: new Date(now.getTime() - 3 * 3_600_000),
        diagnosis: "CAPI silent fail",
      },
    ];

    await testDb.db.insert(monitorRun).values(runs);

    const stats = await getPropertyStats("u1", 30, testDb.db);

    expect(stats).toHaveLength(1);
    expect(stats[0].uptimePct).toBe(80);
  });

  it("returns uptimePct=null and lastDiagnosis=null when no monitor runs exist", async () => {
    // Seed: user → property → funnel, but NO monitor_runs
    await testDb.db.insert(user).values({
      id: "u2",
      name: "Empty User",
      email: "empty@example.com",
    });

    await testDb.db.insert(property).values({
      id: "p2",
      userId: "u2",
      name: "Empty Site",
      domain: "empty.com",
      snippetKey: "snippet-xyz-222",
    });

    await testDb.db.insert(funnel).values({
      id: "f2",
      propertyId: "p2",
      name: "Empty Funnel",
    });

    const stats = await getPropertyStats("u2", 30, testDb.db);

    expect(stats).toHaveLength(1);
    expect(stats[0].uptimePct).toBeNull();
    expect(stats[0].lastDiagnosis).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit test — DashboardContent renders stat cards correctly
// ---------------------------------------------------------------------------

describe("dashboard renders stat cards", () => {
  it("renders uptime % and 'ad spend at risk' callout with mock stats", () => {
    const mockStats: PropertyStat[] = [
      {
        propertyId: "prop-1",
        propertyName: "My Site",
        domain: "mysite.com",
        uptimePct: 80,
        totalRuns: 10,
        lastDiagnosis: "Purchase fired without value",
      },
    ];

    render(
      React.createElement(DashboardContent, { stats7d: mockStats, stats30d: mockStats }),
    );

    // Uptime % should be visible somewhere in the rendered output
    const uptimeElements = screen.getAllByText(/80%/);
    expect(uptimeElements.length).toBeGreaterThan(0);

    // The static 'ad spend at risk' callout must be present
    const riskElements = screen.getAllByText(/ad spend at risk/i);
    expect(riskElements.length).toBeGreaterThan(0);
  });
});
