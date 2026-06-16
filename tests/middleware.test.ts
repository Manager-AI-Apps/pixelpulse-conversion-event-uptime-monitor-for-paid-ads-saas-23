/**
 * Unit tests for the auth-gate middleware.
 * Acceptance tests cover:
 *   - unauthenticated redirect: /dashboard → /sign-in
 *   - unauthenticated redirect: /properties → /sign-in
 *   - unauthenticated API block: /api/monitor/* → 401
 *   - authenticated pass-through for all protected routes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// IMPORTANT: vi.mock is automatically hoisted before imports, so the
// middleware module will see the mocked version of getSessionCookie.
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

import { getSessionCookie } from "better-auth/cookies";
import { middleware } from "@/middleware";

const mockGetSessionCookie = vi.mocked(getSessionCookie);

function makeRequest(pathname: string): ReturnType<typeof middleware> {
  const req = new NextRequest(new URL(pathname, "http://localhost:3000"));
  return middleware(req);
}

describe("middleware auth gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("unauthenticated — page routes redirect to /sign-in", () => {
    it("redirects /dashboard to /sign-in when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/dashboard");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/sign-in");
    });

    it("redirects /dashboard/overview to /sign-in when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/dashboard/overview");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/sign-in");
    });

    it("redirects /properties to /sign-in when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/properties");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/sign-in");
    });

    it("redirects /properties/123 to /sign-in when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/properties/123");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/sign-in");
    });

    it("includes ?next= param pointing at the original path", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/dashboard");
      const location = res.headers.get("location") ?? "";
      const url = new URL(location);
      expect(url.pathname).toBe("/sign-in");
      expect(url.searchParams.get("next")).toBe("/dashboard");
    });
  });

  describe("unauthenticated — API monitor routes return 401", () => {
    it("returns 401 for /api/monitor/status when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/api/monitor/status");
      expect(res.status).toBe(401);
    });

    it("returns 401 for /api/monitor/run when no session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/api/monitor/run");
      expect(res.status).toBe(401);
    });

    it("returns JSON error body for /api/monitor/* when unauthorized", async () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/api/monitor/status");
      const body = await res.json();
      expect(body).toMatchObject({ error: { code: "unauthorized" } });
    });
  });

  describe("authenticated — allows pass-through", () => {
    it("passes /dashboard through when session cookie is present", () => {
      mockGetSessionCookie.mockReturnValue("mock-session-token");
      const res = makeRequest("/dashboard");
      expect(res.status).toBe(200);
    });

    it("passes /properties through when session cookie is present", () => {
      mockGetSessionCookie.mockReturnValue("mock-session-token");
      const res = makeRequest("/properties");
      expect(res.status).toBe(200);
    });

    it("passes /api/monitor/status through when session cookie is present", () => {
      mockGetSessionCookie.mockReturnValue("mock-session-token");
      const res = makeRequest("/api/monitor/status");
      expect(res.status).toBe(200);
    });
  });

  describe("public routes — always allowed", () => {
    it("passes /sign-in through without a session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/sign-in");
      expect(res.status).toBe(200);
    });

    it("passes / (home) through without a session cookie", () => {
      mockGetSessionCookie.mockReturnValue(null);
      const res = makeRequest("/");
      expect(res.status).toBe(200);
    });
  });
});
