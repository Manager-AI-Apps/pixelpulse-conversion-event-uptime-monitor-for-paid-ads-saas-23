/**
 * Unit tests for lib/slack-alert.ts
 *
 * Mocks the global fetch to avoid real network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendSlackAlert } from "@/lib/slack-alert";

const WEBHOOK_URL = "https://hooks.slack.com/services/TEST/WEBHOOK";

describe("sendSlackAlert", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends formatted diagnosis message", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendSlackAlert(
      WEBHOOK_URL,
      "Checkout Funnel",
      "https://example.com/checkout",
      "CAPI silent fail",
    );

    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe(WEBHOOK_URL);
    expect(calledInit.method).toBe("POST");

    const body = JSON.parse(calledInit.body as string) as {
      text?: string;
      blocks?: Array<{ type: string; text?: { text?: string } }>;
    };

    // Diagnosis text must appear somewhere in the body
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toContain("CAPI silent fail");
    expect(bodyStr).toContain("Checkout Funnel");
    expect(bodyStr).toContain("https://example.com/checkout");
  });

  it("retries on 5xx", async () => {
    // Returns 500 twice, then 200 on the third attempt
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendSlackAlert(
      WEBHOOK_URL,
      "Signup Funnel",
      "https://example.com/signup",
      "GA4 property mismatch",
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries on persistent 5xx", async () => {
    // Always returns 500
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      sendSlackAlert(
        WEBHOOK_URL,
        "Test Funnel",
        "https://example.com",
        "Purchase fired without value",
      ),
    ).rejects.toThrow();

    // Initial attempt + 2 retries = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
