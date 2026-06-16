/**
 * GET /api/ingest/snippet.js
 *
 * Returns a JavaScript snippet that:
 *  - Reads the snippet key from `data-key` on the <script> tag.
 *  - Exposes `window.__pixelpulse.track(eventName, payload)` for manual calls.
 *  - Intercepts `window.dataLayer.push()` to auto-forward GTM events.
 *  - Intercepts `window.fbq()` calls to auto-forward Meta Pixel events.
 *  - Posts events to /api/ingest via sendBeacon (with fetch fallback) for
 *    reliable delivery on page unload.
 *
 * Usage on customer sites:
 *   <script src="https://app.pixelpulse.io/api/ingest/snippet.js"
 *           data-key="YOUR_SNIPPET_KEY" async></script>
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  const ingestUrl = `${origin}/api/ingest`;

  // The snippet is a self-invoking function to avoid polluting global scope.
  // It reads the key from the script tag's data-key attribute.
  const js = `/* PixelPulse — conversion event monitor snippet */
(function () {
  'use strict';
  var INGEST_URL = '${ingestUrl}';

  // Find our own <script> tag by matching the current script's src
  var scripts = document.querySelectorAll('script[data-key]');
  var KEY = '';
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].getAttribute('src') || '';
    if (src.indexOf('/api/ingest/snippet.js') !== -1) {
      KEY = scripts[i].getAttribute('data-key') || '';
      break;
    }
  }
  // Fallback: use document.currentScript when available (synchronous load)
  if (!KEY && document.currentScript) {
    KEY = document.currentScript.getAttribute('data-key') || '';
  }

  function send(eventName, payload) {
    if (!KEY) return;
    var body = JSON.stringify({ key: KEY, eventName: String(eventName), payload: payload || {} });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(INGEST_URL, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true })
        .catch(function () { /* best-effort */ });
    }
  }

  // Public API
  window.__pixelpulse = { track: send };

  // --- GTM / dataLayer interception ---
  var _dl = window.dataLayer;
  if (Array.isArray(_dl)) {
    var _origPush = _dl.push.bind(_dl);
    _dl.push = function () {
      for (var i = 0; i < arguments.length; i++) {
        var item = arguments[i];
        if (item && typeof item === 'object' && item.event) {
          send(item.event, item);
        }
      }
      return _origPush.apply(_dl, arguments);
    };
  }

  // --- Meta Pixel (fbq) interception ---
  var _origFbq = window.fbq;
  if (typeof _origFbq === 'function') {
    window.fbq = function () {
      if (arguments[0] === 'track' || arguments[0] === 'trackCustom') {
        send(arguments[1] || 'fb_event', arguments[2] || {});
      }
      return _origFbq.apply(this, arguments);
    };
  }
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
