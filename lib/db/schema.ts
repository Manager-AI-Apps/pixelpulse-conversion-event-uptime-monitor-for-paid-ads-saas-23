/**
 * Drizzle schema.
 *
 * The four tables below (`user`, `session`, `account`, `verification`) are the
 * Better Auth model. Better Auth validates this shape on every query and 500s
 * at runtime if any required column is missing, so they ship pre-defined and
 * correct — do NOT trim "unused" columns (the OAuth token fields on `account`,
 * `ipAddress`/`userAgent` on `session`) even for email+password-only apps.
 *
 * App-specific tables: add them BELOW the Better Auth block during the
 * schema-translation task (translate db_schema.reference.json into Drizzle
 * code here). Keep the Better Auth tables intact.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables — required shape. Do not modify column names/types.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: false }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: false }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

/**
 * property — a user's website/property being monitored.
 * IDs are generated via crypto.randomUUID() at the application layer.
 */
export const property = pgTable(
  "property",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    snippetKey: text("snippet_key").notNull().unique(),
    ga4MeasurementId: text("ga4_measurement_id"),
    metaPixelId: text("meta_pixel_id"),
    stripePublishableKey: text("stripe_publishable_key"),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_property_user_id").on(t.userId)],
);

/**
 * funnel — a recorded signup/checkout funnel belonging to a property.
 */
export const funnel = pgTable(
  "funnel",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id")
      .notNull()
      .references(() => property.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scheduleMinutes: integer("schedule_minutes").notNull().default(15),
    lastRunAt: timestamp("last_run_at", { withTimezone: false }),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_funnel_property_id").on(t.propertyId),
    index("idx_funnel_last_run_at").on(t.lastRunAt),
  ],
);

/**
 * funnel_step — an individual step (page visit + action) within a funnel.
 */
export const funnelStep = pgTable(
  "funnel_step",
  {
    id: text("id").primaryKey(),
    funnelId: text("funnel_id")
      .notNull()
      .references(() => funnel.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    url: text("url").notNull(),
    actionType: text("action_type").notNull(),
    actionSelector: text("action_selector"),
    /** JSON array of expected event assertion objects */
    expectedEvents: jsonb("expected_events").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_funnel_step_funnel_id").on(t.funnelId)],
);

/**
 * monitor_run — one synthetic execution of a funnel.
 */
export const monitorRun = pgTable(
  "monitor_run",
  {
    id: text("id").primaryKey(),
    funnelId: text("funnel_id")
      .notNull()
      .references(() => funnel.id, { onDelete: "cascade" }),
    /** 'passed' | 'failed' | 'error' */
    status: text("status").notNull(),
    diagnosis: text("diagnosis"),
    ranAt: timestamp("ran_at", { withTimezone: false }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("idx_monitor_run_funnel_id").on(t.funnelId),
    index("idx_monitor_run_ran_at").on(t.ranAt),
  ],
);

/**
 * step_result — per-step outcome for a monitor_run.
 */
export const stepResult = pgTable(
  "step_result",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => monitorRun.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => funnelStep.id, { onDelete: "cascade" }),
    passed: boolean("passed").notNull(),
    /** JSON array of observed events */
    firedEvents: jsonb("fired_events").notNull().default([]),
    diagnosis: text("diagnosis"),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_step_result_run_id").on(t.runId)],
);

/**
 * ingest_event — raw pixel/conversion event received from the JS snippet.
 */
export const ingestEvent = pgTable(
  "ingest_event",
  {
    id: text("id").primaryKey(),
    snippetKey: text("snippet_key").notNull(),
    eventName: text("event_name").notNull(),
    /** JSON object of event payload */
    payload: jsonb("payload").notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_ingest_event_snippet_key").on(t.snippetKey),
    index("idx_ingest_event_received_at").on(t.receivedAt),
  ],
);
