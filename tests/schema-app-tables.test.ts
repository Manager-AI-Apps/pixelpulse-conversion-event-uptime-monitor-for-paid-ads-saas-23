/**
 * Acceptance tests for task-1-1: app tables added to lib/db/schema.ts
 *
 * 1. All six app tables are exported from the schema file.
 * 2. No gen_random_uuid() is referenced (IDs are set at the app layer).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("schema: app tables", () => {
  it("exports all six app tables", async () => {
    const schema = await import("../lib/db/schema");

    expect(schema).toHaveProperty("property");
    expect(schema).toHaveProperty("funnel");
    expect(schema).toHaveProperty("funnelStep");
    expect(schema).toHaveProperty("monitorRun");
    expect(schema).toHaveProperty("stepResult");
    expect(schema).toHaveProperty("ingestEvent");
  });

  it("does not use gen_random_uuid() in schema.ts (IDs are app-generated)", () => {
    const schemaPath = resolve(process.cwd(), "lib/db/schema.ts");
    const src = readFileSync(schemaPath, "utf-8");
    expect(src).not.toContain("gen_random_uuid");
  });
});
