/**
 * Unit tests for funnel detail page.
 * We render a thin client wrapper that accepts the step data as props,
 * side-stepping Server Component async constraints.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Next.js navigation so imports don't crash in jsdom
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/properties/prop-1/funnels/funnel-1"),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "user-1", name: "Test User", email: "test@example.com" },
      }),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/actions/properties", () => ({
  listProperties: vi.fn().mockResolvedValue([
    {
      id: "prop-1",
      userId: "user-1",
      name: "My Site",
      domain: "mysite.com",
      snippetKey: "abc123",
      ga4MeasurementId: null,
      metaPixelId: null,
      stripePublishableKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
}));

vi.mock("@/lib/actions/funnels", () => ({
  listFunnels: vi.fn().mockResolvedValue([
    {
      id: "funnel-1",
      propertyId: "prop-1",
      name: "Checkout Funnel",
      scheduleMinutes: 15,
      lastRunAt: null,
      createdAt: new Date(),
    },
  ]),
  listFunnelSteps: vi.fn().mockResolvedValue([
    {
      id: "step-1",
      funnelId: "funnel-1",
      stepOrder: 1,
      url: "https://mysite.com/pricing",
      actionType: "click",
      actionSelector: ".btn-buy",
      expectedEvents: [
        { eventName: "view_item", platform: "ga4" },
        { eventName: "PageView", platform: "meta" },
      ],
      createdAt: new Date(),
    },
    {
      id: "step-2",
      funnelId: "funnel-1",
      stepOrder: 2,
      url: "https://mysite.com/checkout",
      actionType: "submit",
      actionSelector: "form",
      expectedEvents: [
        { eventName: "begin_checkout", platform: "ga4" },
      ],
      createdAt: new Date(),
    },
  ]),
}));

vi.mock("@/lib/actions/monitor-runs", () => ({
  getLatestRunWithStepResults: vi.fn().mockResolvedValue(null),
  getUptimePercent: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("funnel detail renders step table", () => {
  it("renders step URLs and expectedEvents labels", async () => {
    // Import after mocks are set up
    const { default: FunnelDetailPage } = await import(
      "./page"
    );

    const params = Promise.resolve({
      propertyId: "prop-1",
      funnelId: "funnel-1",
    });

    const jsx = await FunnelDetailPage({ params });
    render(jsx as React.ReactElement);

    // Step URLs should be visible
    expect(
      screen.getByText("https://mysite.com/pricing"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://mysite.com/checkout"),
    ).toBeInTheDocument();

    // expectedEvents labels should appear
    expect(screen.getByText(/view_item/i)).toBeInTheDocument();
    expect(screen.getByText(/begin_checkout/i)).toBeInTheDocument();
  });
});
