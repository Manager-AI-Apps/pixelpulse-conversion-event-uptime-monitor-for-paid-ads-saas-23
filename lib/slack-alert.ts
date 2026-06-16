/**
 * Slack alerting helper.
 *
 * sendSlackAlert posts a diagnostic message to a Slack incoming-webhook URL.
 * - 10-second AbortController timeout per attempt.
 * - Retries up to 2 times on HTTP 5xx responses (3 total attempts).
 * - Throws if all attempts fail.
 */

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2; // up to 2 retries = 3 total attempts

export class SlackAlertError extends Error {
  constructor(
    message: string,
    public readonly lastStatusCode?: number,
  ) {
    super(message);
    this.name = "SlackAlertError";
  }
}

/**
 * Sends a Slack alert with a formatted diagnosis message.
 *
 * @param webhookUrl   - Slack incoming-webhook URL (SLACK_WEBHOOK_URL env var).
 * @param funnelName   - Human-readable funnel name.
 * @param stepUrl      - URL of the funnel step that failed.
 * @param diagnosis    - Short diagnosis string (e.g. "CAPI silent fail").
 */
export async function sendSlackAlert(
  webhookUrl: string,
  funnelName: string,
  stepUrl: string,
  diagnosis: string,
): Promise<void> {
  const body = buildSlackPayload(funnelName, stepUrl, diagnosis);
  const bodyJson = JSON.stringify(body);

  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson,
        signal: controller.signal,
      });

      lastStatus = response.status;

      if (response.ok) {
        return; // success
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        // Server error — retry
        continue;
      }

      // Non-5xx error or last attempt — throw
      throw new SlackAlertError(
        `Slack webhook returned HTTP ${response.status} (funnel: ${funnelName})`,
        response.status,
      );
    } catch (err) {
      if (err instanceof SlackAlertError) {
        throw err;
      }
      // Network / timeout error — retry if attempts remain
      if (attempt < MAX_RETRIES) {
        continue;
      }
      const message =
        err instanceof Error ? err.message : "Unknown network error";
      throw new SlackAlertError(
        `Slack webhook failed after ${MAX_RETRIES + 1} attempts: ${message}`,
        lastStatus,
      );
    } finally {
      clearTimeout(timerId);
    }
  }

  // Exhausted retries on 5xx
  throw new SlackAlertError(
    `Slack webhook returned HTTP ${lastStatus ?? "unknown"} after ${MAX_RETRIES + 1} attempts (funnel: ${funnelName})`,
    lastStatus,
  );
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
}

interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

function buildSlackPayload(
  funnelName: string,
  stepUrl: string,
  diagnosis: string,
): SlackPayload {
  const fallbackText = `⚠️ PixelPulse alert: *${funnelName}* failed — ${diagnosis}`;

  return {
    text: fallbackText,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ PixelPulse — Funnel Failure Detected",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Funnel:* ${funnelName}\n*Step URL:* <${stepUrl}|${stepUrl}>\n*Diagnosis:* \`${diagnosis}\``,
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        text: {
          type: "mrkdwn",
          text: "Sent by PixelPulse synthetic monitor.",
        },
      },
    ],
  };
}
