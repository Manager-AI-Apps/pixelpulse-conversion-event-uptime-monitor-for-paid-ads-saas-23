/**
 * Property data-access functions.
 *
 * Each function accepts a `db` parameter (defaults to the production db) so
 * integration tests can inject an in-process PGlite db via createTestDb().
 * All mutations validate that the caller (userId) owns the relevant resource.
 */

import { eq } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { property } from "@/lib/db/schema";

export type PropertyRow = typeof property.$inferSelect;

export type CreatePropertyInput = {
  name: string;
  domain: string;
  ga4MeasurementId?: string;
  metaPixelId?: string;
  stripePublishableKey?: string;
};

/** Insert a new property owned by `userId`. */
export async function createProperty(
  db: Database = appDb,
  userId: string,
  data: CreatePropertyInput,
): Promise<PropertyRow> {
  if (!data.name.trim()) {
    throw new Error("Property name is required.");
  }
  if (!data.domain.trim()) {
    throw new Error("Domain is required.");
  }

  const id = crypto.randomUUID();
  const snippetKey = crypto.randomUUID().replace(/-/g, "");

  const [row] = await db
    .insert(property)
    .values({
      id,
      userId,
      name: data.name.trim(),
      domain: data.domain.trim(),
      snippetKey,
      ga4MeasurementId: data.ga4MeasurementId ?? null,
      metaPixelId: data.metaPixelId ?? null,
      stripePublishableKey: data.stripePublishableKey ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create property.");
  }

  return row;
}

/** List all properties owned by `userId`, newest first. */
export async function listProperties(
  db: Database = appDb,
  userId: string,
): Promise<PropertyRow[]> {
  return db
    .select()
    .from(property)
    .where(eq(property.userId, userId))
    .orderBy(property.createdAt);
}

/**
 * Delete a property owned by `userId`.
 * Funnels and funnel_steps cascade automatically via FK.
 * Throws if the property does not exist or is not owned by `userId`.
 */
export async function deleteProperty(
  db: Database = appDb,
  userId: string,
  id: string,
): Promise<void> {
  // Verify ownership before deleting
  const [existing] = await db
    .select()
    .from(property)
    .where(eq(property.id, id));

  if (!existing) {
    throw new Error("Property not found.");
  }
  if (existing.userId !== userId) {
    throw new Error("Forbidden: you do not own this property.");
  }

  await db.delete(property).where(eq(property.id, id));
}
