/**
 * Unit tests for the snippet installation page.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Next.js navigation
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/properties/prop-1/snippet"),
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
      snippetKey: "testsnippetkey999",
      ga4MeasurementId: null,
      metaPixelId: null,
      stripePublishableKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("snippet page renders install code", () => {
  it("renders script tag with snippetKey present", async () => {
    const { default: SnippetPage } = await import("./page");

    const params = Promise.resolve({ propertyId: "prop-1" });

    const jsx = await SnippetPage({ params });
    render(jsx as React.ReactElement);

    // The snippet key should appear on the page (may appear in multiple elements)
    const keyMatches = screen.getAllByText(/testsnippetkey999/);
    expect(keyMatches.length).toBeGreaterThan(0);

    // A script src text containing snippet.js should appear somewhere
    const scriptMatches = screen.getAllByText(/snippet\.js/i);
    expect(scriptMatches.length).toBeGreaterThan(0);
  });
});
