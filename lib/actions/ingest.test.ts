/**
 * Integration tests for the ingest data-access layer.
 *
 * Tests use createTestDb() — an in-process PGlite DB with the full app schema
 * applied — so each test exercises real DB constraints.
 */

import { beforeEach, afterEach, describe, it, expect } from "vitest";

import { createTestDb } from "@/tests/helpers/test-db";
import * as schema from "@/lib/db/schema";
import { processIngestEvent } from "@/lib/actions/ingest";
import { ApiError } from "@/lib/api-error";

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

// Helper: insert a property row with a known snippetKey
async function insertProperty(
  db: TestDb["db"],
  userId: string,
  snippetKey: string,
): Promise<typeof schema.property.$inferSelect> {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(schema.property)
    .values({
      id,
      userId,
      name: "Test Property",
      domain: "example.com",
      snippetKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return row!;
}

describe("ingest persists event row", () => {
  it("inserts ingest_event row with correct eventName and snippetKey", async () => {
    await insertUser(testDb.db, "user-1", "user1@example.com");
    await insertProperty(testDb.db, "user-1", "validkey123");

    const result = await processIngestEvent(
      testDb.db,
      "validkey123",
      "purchase",
      { value: 99, currency: "USD" },
    );

    expect(result.snippetKey).toBe("validkey123");
    expect(result.eventName).toBe("purchase");
    expect(result.id).toBeTruthy();

    // Verify the row is actually in the DB
    const rows = await testDb.db.select().from(schema.ingestEvent);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventName).toBe("purchase");
    expect(rows[0].snippetKey).toBe("validkey123");
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload.value).toBe(99);
  });
});

describe("ingest 404 on unknown key", () => {
  it("throws ApiError not_found for an unknown snippetKey", async () => {
    await expect(
      processIngestEvent(testDb.db, "unknownkey", "purchase", {}),
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof ApiError && e.code === "not_found";
    });
  });
});

describe("DB-backed rate limit rejects burst", () => {
  it("returns rate_limited after 101 events for snippetKey in last 60s", async () => {
    await insertUser(testDb.db, "user-2", "user2@example.com");
    await insertProperty(testDb.db, "user-2", "burstkey456");

    // Insert 101 ingest_event rows with receivedAt = now (within the 60s window)
    const now = new Date();
    for (let i = 0; i < 101; i++) {
      await testDb.db.insert(schema.ingestEvent).values({
        id: crypto.randomUUID(),
        snippetKey: "burstkey456",
        eventName: "pageview",
        payload: {},
        receivedAt: now,
      });
    }

    await expect(
      processIngestEvent(testDb.db, "burstkey456", "purchase", {}),
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof ApiError && e.code === "rate_limited";
    });
  });
});
