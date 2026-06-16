/**
 * Funnel + funnel-step data-access functions.
 *
 * Each function accepts a `db` parameter (defaults to the production db) so
 * integration tests can inject an in-process PGlite db via createTestDb().
 * Ownership is enforced by verifying the funnel's property belongs to userId.
 */

import { eq } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, funnelStep, property } from "@/lib/db/schema";

export type FunnelRow = typeof funnel.$inferSelect;
export type FunnelStepRow = typeof funnelStep.$inferSelect;

export type CreateFunnelInput = {
  propertyId: string;
  name: string;
  scheduleMinutes?: number;
};

export type CreateFunnelStepInput = {
  funnelId: string;
  stepOrder: number;
  url: string;
  actionType: string;
  actionSelector?: string;
  expectedEvents?: unknown[];
};

/** Assert the funnel's property belongs to userId; throws if not. */
async function assertFunnelOwnership(
  db: Database,
  userId: string,
  funnelId: string,
): Promise<FunnelRow> {
  const [fn] = await db
    .select()
    .from(funnel)
    .where(eq(funnel.id, funnelId));

  if (!fn) {
    throw new Error("Funnel not found.");
  }

  const [prop] = await db
    .select()
    .from(property)
    .where(eq(property.id, fn.propertyId));

  if (!prop || prop.userId !== userId) {
    throw new Error("Forbidden: you do not own this funnel.");
  }

  return fn;
}

/** Insert a new funnel under a property owned by `userId`. */
export async function createFunnel(
  db: Database = appDb,
  userId: string,
  data: CreateFunnelInput,
): Promise<FunnelRow> {
  if (!data.name.trim()) {
    throw new Error("Funnel name is required.");
  }

  // Ownership: verify property belongs to userId
  const [prop] = await db
    .select()
    .from(property)
    .where(eq(property.id, data.propertyId));

  if (!prop) {
    throw new Error("Property not found.");
  }
  if (prop.userId !== userId) {
    throw new Error("Forbidden: you do not own this property.");
  }

  const id = crypto.randomUUID();

  const [row] = await db
    .insert(funnel)
    .values({
      id,
      propertyId: data.propertyId,
      name: data.name.trim(),
      scheduleMinutes: data.scheduleMinutes ?? 15,
      createdAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create funnel.");
  }

  return row;
}

/** List all funnels for a property owned by `userId`. */
export async function listFunnels(
  db: Database = appDb,
  userId: string,
  propertyId: string,
): Promise<FunnelRow[]> {
  // Verify property ownership
  const [prop] = await db
    .select()
    .from(property)
    .where(eq(property.id, propertyId));

  if (!prop || prop.userId !== userId) {
    throw new Error("Forbidden: you do not own this property.");
  }

  return db
    .select()
    .from(funnel)
    .where(eq(funnel.propertyId, propertyId))
    .orderBy(funnel.createdAt);
}

/**
 * Delete a funnel owned (via its property) by `userId`.
 * funnel_steps cascade automatically.
 */
export async function deleteFunnel(
  db: Database = appDb,
  userId: string,
  funnelId: string,
): Promise<void> {
  await assertFunnelOwnership(db, userId, funnelId);
  await db.delete(funnel).where(eq(funnel.id, funnelId));
}

/** Insert a new step into a funnel owned (via its property) by `userId`. */
export async function createFunnelStep(
  db: Database = appDb,
  userId: string,
  data: CreateFunnelStepInput,
): Promise<FunnelStepRow> {
  if (!data.url.trim()) {
    throw new Error("Step URL is required.");
  }
  if (!data.actionType.trim()) {
    throw new Error("Action type is required.");
  }

  await assertFunnelOwnership(db, userId, data.funnelId);

  const id = crypto.randomUUID();

  const [row] = await db
    .insert(funnelStep)
    .values({
      id,
      funnelId: data.funnelId,
      stepOrder: data.stepOrder,
      url: data.url.trim(),
      actionType: data.actionType.trim(),
      actionSelector: data.actionSelector ?? null,
      expectedEvents: data.expectedEvents ?? [],
      createdAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create funnel step.");
  }

  return row;
}

/**
 * List all steps for a funnel owned (via its property) by `userId`, ordered
 * by step_order ascending.
 */
export async function listFunnelSteps(
  db: Database = appDb,
  userId: string,
  funnelId: string,
): Promise<FunnelStepRow[]> {
  await assertFunnelOwnership(db, userId, funnelId);

  return db
    .select()
    .from(funnelStep)
    .where(eq(funnelStep.funnelId, funnelId))
    .orderBy(funnelStep.stepOrder);
}
