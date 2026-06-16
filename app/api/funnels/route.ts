import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRoute, ApiError } from "@/lib/api-error";
import { createFunnel, createFunnelStep } from "@/lib/actions/funnels";

const expectedEventSchema = z.record(z.string(), z.unknown());

const stepSchema = z.object({
  stepOrder: z.number().int().min(1),
  url: z.string().min(1, "URL is required"),
  actionType: z.enum(["navigate", "click", "fill", "submit"]),
  actionSelector: z.string().optional(),
  expectedEvents: z.array(expectedEventSchema).default([]),
});

const createFunnelSchema = z.object({
  propertyId: z.string().min(1, "propertyId is required"),
  name: z.string().min(1, "name is required").max(200),
  scheduleMinutes: z.number().int().min(5).max(1440).default(15),
  steps: z.array(stepSchema).min(1, "At least one step is required"),
});

export const POST = handleRoute(async (req: NextRequest) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ApiError("unauthorized", "Authentication required.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("bad_request", "Invalid JSON body.");
  }

  const parsed = createFunnelSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? (parsed.error as unknown as { errors: Array<{ message: string }> }).errors;
    const firstMessage = Array.isArray(issues) && issues[0]?.message
      ? issues[0].message
      : "Invalid request body.";
    throw new ApiError("bad_request", firstMessage);
  }

  const { propertyId, name, scheduleMinutes, steps } = parsed.data;
  const userId = session.user.id;

  // Create the funnel (ownership check inside)
  const funnel = await createFunnel(db, userId, {
    propertyId,
    name,
    scheduleMinutes,
  });

  // Create steps in parallel
  await Promise.all(
    steps.map((step) =>
      createFunnelStep(db, userId, {
        funnelId: funnel.id,
        stepOrder: step.stepOrder,
        url: step.url,
        actionType: step.actionType,
        actionSelector: step.actionSelector,
        expectedEvents: step.expectedEvents,
      }),
    ),
  );

  return NextResponse.json({ ok: true, funnelId: funnel.id }, { status: 201 });
});
