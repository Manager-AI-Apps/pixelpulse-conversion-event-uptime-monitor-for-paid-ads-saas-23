/**
 * Pixel Analyzer — fetches a page and detects GA4, Meta Pixel, Meta CAPI,
 * and Stripe tracking events by parsing inline scripts and HTML content.
 *
 * No external dependencies; uses built-in fetch with AbortController timeout.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type EventPlatform = "ga4" | "meta_pixel" | "meta_capi" | "stripe";

export interface FiredEvent {
  platform: EventPlatform;
  eventName: string;
  value?: number;
  currency?: string;
  dedupKey?: string;
  measurementId?: string;
  raw?: Record<string, unknown>;
}

export type DiagnosisType =
  | "Purchase fired without value"
  | "duplicate via gtag + GTM"
  | "CAPI silent fail"
  | "GA4 property mismatch"
  | null;

export interface AnalysisResult {
  firedEvents: FiredEvent[];
  passed: boolean;
  diagnosis: DiagnosisType;
}

export interface ExpectedEvent {
  platform: EventPlatform;
  eventName: string;
  /** If true, diagnosis fires when this purchase event lacks a numeric value */
  requireValue?: boolean;
  /** GA4 measurement ID (e.g. "G-XXXXXXXXXX") to verify against */
  measurementId?: string;
}

export interface FunnelStep {
  url: string;
  expectedEvents: ExpectedEvent[];
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// --------------------------------------------------------------------------
// HTML parsers
// --------------------------------------------------------------------------

/**
 * Walk the string from `fromIndex` to find balanced `{...}` braces.
 * Returns the matched substring (including braces), or `""` if none found.
 */
function extractBalancedBraces(html: string, fromIndex: number): string {
  let depth = 0;
  let start = -1;
  for (let i = fromIndex; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") {
      depth++;
      if (start === -1) start = i;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return html.slice(start, i + 1);
      }
    }
  }
  return "";
}

/**
 * Extract a property value from an object-literal string.
 * Handles numeric values (`value: 99.00`) and string values (`currency: 'USD'`).
 * Uses word-boundary matching so `evil_value` does not match `value`.
 */
function extractProp(objStr: string, key: string): string | undefined {
  // Quote-wrapped key or bare word, followed by colon
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numericRe = new RegExp(
    `(?:['"]${escapedKey}['"]|\\b${escapedKey}\\b)\\s*:\\s*([\\d.]+)`,
    "i"
  );
  const stringRe = new RegExp(
    `(?:['"]${escapedKey}['"]|\\b${escapedKey}\\b)\\s*:\\s*['"]([^'"]+)['"]`,
    "i"
  );

  const numMatch = objStr.match(numericRe);
  if (numMatch) return numMatch[1];
  const strMatch = objStr.match(stringRe);
  if (strMatch) return strMatch[1];

  return undefined;
}

/**
 * Find the GA4 measurement ID from a `gtag('config', 'G-...')` call.
 */
function extractGA4MeasurementId(html: string): string | undefined {
  const re = /gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/i;
  return html.match(re)?.[1];
}

/**
 * Parse GA4 events from:
 *   - `gtag('event', 'eventname', { ... })`
 *   - `dataLayer.push({ event: 'eventname', ... })` (GTM style)
 */
function parseGA4Events(html: string): FiredEvent[] {
  const events: FiredEvent[] = [];
  const measurementId = extractGA4MeasurementId(html);

  // gtag('event', 'eventname', { ... })
  const gtagRe = /gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]\s*,/gi;
  let m: RegExpExecArray | null;

  while ((m = gtagRe.exec(html)) !== null) {
    const eventName = m[1];
    const matchEnd = m.index + m[0].length;
    const objStart = html.indexOf("{", matchEnd);
    if (objStart === -1) continue;

    const objStr = extractBalancedBraces(html, objStart);
    const valueStr = extractProp(objStr, "value");
    const currency = extractProp(objStr, "currency");
    const dedupKey =
      extractProp(objStr, "transaction_id") ??
      extractProp(objStr, "event_id");

    events.push({
      platform: "ga4",
      eventName,
      value: valueStr !== undefined ? parseFloat(valueStr) : undefined,
      currency,
      dedupKey,
      measurementId,
    });
  }

  // dataLayer.push({ event: 'eventname', ... }) — GTM style
  const dlRe = /dataLayer\s*\.\s*push\s*\(/gi;
  while ((m = dlRe.exec(html)) !== null) {
    const matchEnd = m.index + m[0].length;
    const objStart = html.indexOf("{", matchEnd);
    if (objStart === -1) continue;

    const objStr = extractBalancedBraces(html, objStart);
    const eventName = extractProp(objStr, "event");
    if (eventName) {
      const valueStr =
        extractProp(objStr, "revenue") ?? extractProp(objStr, "value");
      const currency = extractProp(objStr, "currency");

      events.push({
        platform: "ga4",
        eventName,
        value: valueStr !== undefined ? parseFloat(valueStr) : undefined,
        currency,
        measurementId,
        raw: { source: "dataLayer" },
      });
    }
  }

  return events;
}

/**
 * Parse Meta browser-pixel events from `fbq('track', 'EventName', { ... })`.
 * Also registers a synthetic PageView if fbevents.js is loaded.
 */
function parseMetaPixelEvents(html: string): FiredEvent[] {
  const events: FiredEvent[] = [];

  // fbq('track', 'EventName') or fbq('track', 'EventName', { ... })
  const fbqRe = /fbq\s*\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/gi;
  let m: RegExpExecArray | null;

  while ((m = fbqRe.exec(html)) !== null) {
    const eventName = m[1];
    const matchEnd = m.index + m[0].length;
    const remaining = html.slice(matchEnd).trimStart();

    let value: number | undefined;
    let currency: string | undefined;
    let dedupKey: string | undefined;

    // Look for trailing object argument
    if (remaining.startsWith(",") || remaining.startsWith("{")) {
      const objStart = html.indexOf("{", matchEnd);
      if (objStart !== -1) {
        // Only use the object if it appears before the statement's closing paren
        const closingParen = html.indexOf(")", matchEnd);
        if (closingParen === -1 || objStart < closingParen) {
          const objStr = extractBalancedBraces(html, objStart);
          const valueStr = extractProp(objStr, "value");
          currency = extractProp(objStr, "currency");
          dedupKey =
            extractProp(objStr, "event_id") ??
            extractProp(objStr, "order_id");
          value = valueStr !== undefined ? parseFloat(valueStr) : undefined;
        }
      }
    }

    events.push({ platform: "meta_pixel", eventName, value, currency, dedupKey });
  }

  // If fbevents.js is loaded but no explicit track call was found, register PageView
  if (events.length === 0 && /fbevents\.js/i.test(html)) {
    events.push({ platform: "meta_pixel", eventName: "PageView" });
  }

  return events;
}

/**
 * Detect Meta Conversions API (CAPI) calls.
 * CAPI calls may appear as client-side fetch/XHR calls to graph.facebook.com,
 * or via a proxy endpoint referenced in inline scripts.
 */
function parseMetaCAPIEvents(html: string): FiredEvent[] {
  const events: FiredEvent[] = [];
  // Look for direct graph.facebook.com calls (e.g. client-side CAPI proxy)
  const capiRe = /graph\.facebook\.com\/[^"'\s]*\/events/gi;
  let m: RegExpExecArray | null;
  while ((m = capiRe.exec(html)) !== null) {
    // Event name is not reliably extractable from the URL alone; use 'Purchase'
    // as a fallback since CAPI is most commonly used for purchase events.
    void m; // consumed for side-effect only
    events.push({ platform: "meta_capi", eventName: "Purchase" });
  }
  return events;
}

/**
 * Detect Stripe payment events via r.stripe.com references.
 */
function parseStripeEvents(html: string): FiredEvent[] {
  if (/r\.stripe\.com/i.test(html)) {
    return [{ platform: "stripe", eventName: "r.stripe.com" }];
  }
  return [];
}

// --------------------------------------------------------------------------
// Diagnosis engine
// --------------------------------------------------------------------------

function diagnose(
  firedEvents: FiredEvent[],
  expectedEvents: ExpectedEvent[]
): DiagnosisType {
  // 1. GA4 property mismatch — fired measurement ID differs from expected
  for (const expected of expectedEvents) {
    if (expected.platform === "ga4" && expected.measurementId) {
      const ga4Fired = firedEvents.filter(
        (e) => e.platform === "ga4" && e.measurementId != null
      );
      if (
        ga4Fired.length > 0 &&
        ga4Fired.every((e) => e.measurementId !== expected.measurementId)
      ) {
        return "GA4 property mismatch";
      }
    }
  }

  // 2. Duplicate via gtag + GTM — same purchase event from both sources
  const gtagPurchases = firedEvents.filter(
    (e) =>
      e.platform === "ga4" &&
      e.eventName.toLowerCase() === "purchase" &&
      !e.raw
  );
  const gtmPurchases = firedEvents.filter(
    (e) =>
      e.platform === "ga4" &&
      e.eventName.toLowerCase() === "purchase" &&
      e.raw?.source === "dataLayer"
  );
  if (gtagPurchases.length > 0 && gtmPurchases.length > 0) {
    return "duplicate via gtag + GTM";
  }

  // 3. Purchase fired without value
  const purchaseExpectedWithValue = expectedEvents.some(
    (e) => e.eventName.toLowerCase() === "purchase" && e.requireValue
  );
  if (purchaseExpectedWithValue) {
    const purchaseFiredWithoutValue = firedEvents.find(
      (e) =>
        e.eventName.toLowerCase() === "purchase" &&
        (e.platform === "ga4" || e.platform === "meta_pixel") &&
        e.value === undefined
    );
    if (purchaseFiredWithoutValue) {
      return "Purchase fired without value";
    }
  }

  // 4. CAPI silent fail — browser pixel fired but CAPI not called
  const capiExpected = expectedEvents.some((e) => e.platform === "meta_capi");
  const capiFired = firedEvents.some((e) => e.platform === "meta_capi");
  const browserPixelFired = firedEvents.some((e) => e.platform === "meta_pixel");
  if (capiExpected && browserPixelFired && !capiFired) {
    return "CAPI silent fail";
  }

  return null;
}

function calculatePassed(
  firedEvents: FiredEvent[],
  expectedEvents: ExpectedEvent[],
  diagnosis: DiagnosisType
): boolean {
  if (diagnosis !== null) return false;

  for (const expected of expectedEvents) {
    const found = firedEvents.some(
      (f) =>
        f.platform === expected.platform &&
        f.eventName.toLowerCase() === expected.eventName.toLowerCase()
    );
    if (!found) return false;
  }

  return true;
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Fetch `step.url`, parse tracking event signals from the HTML, and return
 * a typed `AnalysisResult` with `firedEvents`, `passed`, and `diagnosis`.
 *
 * @param step      The funnel step with URL and expected events.
 * @param fetchFn   Override for `globalThis.fetch` (useful in tests).
 */
export async function analyzeStep(
  step: FunnelStep,
  fetchFn: FetchFn = globalThis.fetch
): Promise<AnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let html: string;
  try {
    const response = await fetchFn(step.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${step.url}: HTTP ${response.status} ${response.statusText}`
      );
    }
    html = await response.text();
  } finally {
    clearTimeout(timeoutId);
  }

  const firedEvents: FiredEvent[] = [
    ...parseGA4Events(html),
    ...parseMetaPixelEvents(html),
    ...parseMetaCAPIEvents(html),
    ...parseStripeEvents(html),
  ];

  const diagnosis = diagnose(firedEvents, step.expectedEvents);
  const passed = calculatePassed(firedEvents, step.expectedEvents, diagnosis);

  return { firedEvents, passed, diagnosis };
}
