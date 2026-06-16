import { describe, it, expect } from "vitest";
import { analyzeStep, type FunnelStep } from "@/lib/pixel-analyzer";

describe("analyzeStep", () => {
  it("detects missing purchase value", async () => {
    const html = `<html><head>
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script>
      <script>
        gtag('config', 'G-TEST123');
        gtag('event', 'purchase', { transaction_id: 'T123', currency: 'USD' });
      </script>
    </head><body></body></html>`;

    const mockFetch = async (_url: string, _init?: RequestInit) =>
      new Response(html, { status: 200 });

    const step: FunnelStep = {
      url: "https://example.com/checkout",
      expectedEvents: [
        { platform: "ga4", eventName: "purchase", requireValue: true },
      ],
    };

    const result = await analyzeStep(step, mockFetch);
    expect(result.diagnosis).toBe("Purchase fired without value");
    expect(result.passed).toBe(false);
  });

  it("detects CAPI silent fail", async () => {
    // Browser pixel fires but no CAPI endpoint is called
    const html = `<html><head>
      <script>
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){};
        t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '123456789');
        fbq('track', 'Purchase', { value: 99.00, currency: 'USD' });
      </script>
    </head><body></body></html>`;

    const mockFetch = async (_url: string, _init?: RequestInit) =>
      new Response(html, { status: 200 });

    const step: FunnelStep = {
      url: "https://example.com/checkout",
      expectedEvents: [
        { platform: "meta_pixel", eventName: "Purchase" },
        { platform: "meta_capi", eventName: "Purchase" },
      ],
    };

    const result = await analyzeStep(step, mockFetch);
    expect(result.diagnosis).toBe("CAPI silent fail");
    expect(result.passed).toBe(false);
  });

  it("passes clean step", async () => {
    const html = `<html><head>
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-CLEAN01"></script>
      <script>
        gtag('config', 'G-CLEAN01');
        gtag('event', 'purchase', { value: 99.00, currency: 'USD', transaction_id: 'T123' });
      </script>
      <script>
        fbq('track', 'Purchase', { value: 99.00, currency: 'USD' });
      </script>
    </head><body></body></html>`;

    const mockFetch = async (_url: string, _init?: RequestInit) =>
      new Response(html, { status: 200 });

    const step: FunnelStep = {
      url: "https://example.com/checkout",
      expectedEvents: [
        { platform: "ga4", eventName: "purchase", requireValue: true },
        { platform: "meta_pixel", eventName: "Purchase" },
      ],
    };

    const result = await analyzeStep(step, mockFetch);
    expect(result.passed).toBe(true);
    expect(result.diagnosis).toBeNull();
  });
});
