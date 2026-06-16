/**
 * Integration tests for property + funnel server actions.
 *
 * Uses createTestDb() — an in-process PGlite DB with the full app schema — so
 * each test gets a fresh, isolated DB with real FK constraints and cascade rules.
 */

import { beforeEach, afterEach, describe, it, expect } from "vitest";

import { createTestDb } from "@/tests/helpers/test-db";
import * as schema from "@/lib/db/schema";
import {
  createProperty,
  listProperties,
  deleteProperty,
} from "@/lib/actions/properties";
import {
  createFunnel,
  createFunnelStep,
  listFunnelSteps,
  deleteFunnel,
} from "@/lib/actions/funnels";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let testDb: TestDb;

beforeEach(async () => {
  testDb = await createTestDb();
});

afterEach(async () => {
  await testDb.close();
});

// Helper: insert a minimal user to satisfy the FK constraint on property.userId
async function insertUser(
  db: TestDb["db"],
  id: string,
  email: string,
): Promise<void> {
  await db.insert(schema.user).values({
    id,
    name: `User ${id}`,
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("createProperty persists row scoped to user", () => {
  it("inserts a row owned by userId and hides it from other users", async () => {
    await insertUser(testDb.db, "user-a", "a@example.com");
    await insertUser(testDb.db, "user-b", "b@example.com");

    const prop = await createProperty(testDb.db, "user-a", {
      name: "My SaaS Site",
      domain: "example.com",
    });

    expect(prop.userId).toBe("user-a");
    expect(prop.name).toBe("My SaaS Site");
    expect(prop.domain).toBe("example.com");
    expect(typeof prop.snippetKey).toBe("string");
    expect(prop.snippetKey.length).toBeGreaterThan(0);

    const userAList = await listProperties(testDb.db, "user-a");
    expect(userAList).toHaveLength(1);
    expect(userAList[0].id).toBe(prop.id);

    // user-b cannot see user-a's property
    const userBList = await listProperties(testDb.db, "user-b");
    expect(userBList).toHaveLength(0);
  });
});

describe("createFunnelStep persists expectedEvents JSON", () => {
  it("stores expectedEvents as jsonb and returns typed results via listFunnelSteps", async () => {
    await insertUser(testDb.db, "user-c", "c@example.com");

    const prop = await createProperty(testDb.db, "user-c", {
      name: "Checkout Site",
      domain: "checkout.example.com",
    });

    const fn = await createFunnel(testDb.db, "user-c", {
      propertyId: prop.id,
      name: "Signup Funnel",
      scheduleMinutes: 15,
    });

    const expectedEvents = [
      { provider: "ga4", eventName: "purchase", currency: "USD", value: 99 },
      { provider: "meta", eventName: "Purchase" },
    ];

    const step = await createFunnelStep(testDb.db, "user-c", {
      funnelId: fn.id,
      stepOrder: 1,
      url: "https://checkout.example.com/checkout",
      actionType: "click",
      actionSelector: "#buy-now",
      expectedEvents,
    });

    expect(step.funnelId).toBe(fn.id);
    expect(step.stepOrder).toBe(1);

    const steps = await listFunnelSteps(testDb.db, "user-c", fn.id);
    expect(steps).toHaveLength(1);

    // expectedEvents must round-trip as an array with the right shape
    const returned = steps[0].expectedEvents as typeof expectedEvents;
    expect(Array.isArray(returned)).toBe(true);
    expect(returned).toHaveLength(2);
    expect(returned[0].provider).toBe("ga4");
    expect(returned[0].eventName).toBe("purchase");
    expect(returned[1].provider).toBe("meta");
  });
});

describe("deleteProperty cascades", () => {
  it("removes funnels and funnel_steps via cascade", async () => {
    await insertUser(testDb.db, "user-d", "d@example.com");

    const prop = await createProperty(testDb.db, "user-d", {
      name: "Cascade Test",
      domain: "cascade.example.com",
    });

    const fn = await createFunnel(testDb.db, "user-d", {
      propertyId: prop.id,
      name: "Main Funnel",
      scheduleMinutes: 30,
    });

    await createFunnelStep(testDb.db, "user-d", {
      funnelId: fn.id,
      stepOrder: 1,
      url: "https://cascade.example.com/",
      actionType: "navigate",
      expectedEvents: [],
    });

    // Confirm data exists before deletion
    const funnelsBefore = await testDb.db
      .select()
      .from(schema.funnel)
      .where(
        (await import("drizzle-orm")).eq(schema.funnel.id, fn.id),
      );
    expect(funnelsBefore).toHaveLength(1);

    const stepsBefore = await testDb.db
      .select()
      .from(schema.funnelStep)
      .where(
        (await import("drizzle-orm")).eq(schema.funnelStep.funnelId, fn.id),
      );
    expect(stepsBefore).toHaveLength(1);

    // Delete the property — should cascade
    await deleteProperty(testDb.db, "user-d", prop.id);

    // Funnel and steps should be gone via cascade
    const funnelsAfter = await testDb.db
      .select()
      .from(schema.funnel)
      .where(
        (await import("drizzle-orm")).eq(schema.funnel.id, fn.id),
      );
    expect(funnelsAfter).toHaveLength(0);

    const stepsAfter = await testDb.db
      .select()
      .from(schema.funnelStep)
      .where(
        (await import("drizzle-orm")).eq(schema.funnelStep.funnelId, fn.id),
      );
    expect(stepsAfter).toHaveLength(0);
  });

  it("rejects deleteProperty for a property the user does not own", async () => {
    await insertUser(testDb.db, "owner", "owner@example.com");
    await insertUser(testDb.db, "attacker", "attacker@example.com");

    const prop = await createProperty(testDb.db, "owner", {
      name: "Protected",
      domain: "protected.example.com",
    });

    await expect(
      deleteProperty(testDb.db, "attacker", prop.id),
    ).rejects.toThrow();
  });
});

describe("deleteFunnel", () => {
  it("removes a funnel owned by the user's property", async () => {
    await insertUser(testDb.db, "user-e", "e@example.com");

    const prop = await createProperty(testDb.db, "user-e", {
      name: "Test",
      domain: "test.example.com",
    });

    const fn = await createFunnel(testDb.db, "user-e", {
      propertyId: prop.id,
      name: "To Delete",
      scheduleMinutes: 15,
    });

    await deleteFunnel(testDb.db, "user-e", fn.id);

    const rows = await testDb.db
      .select()
      .from(schema.funnel)
      .where(
        (await import("drizzle-orm")).eq(schema.funnel.id, fn.id),
      );
    expect(rows).toHaveLength(0);
  });
});
