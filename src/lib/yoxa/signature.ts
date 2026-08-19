import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verification for webhooks Yoxa sends to this app.
 *
 * The HMAC covers `<timestamp> + "." + <raw body bytes>`, so the raw body must
 * be read before any JSON parse. Re-serialising parsed JSON changes the bytes
 * and the signature will not match.
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type VerifyResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 500; message: string };

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyWebhookSignature(args: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  now?: Date;
}): VerifyResult {
  const secret = process.env.YOXA_HITL_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 500,
      message: "YOXA_HITL_WEBHOOK_SIGNING_SECRET is not configured.",
    };
  }

  if (!args.timestampHeader || !args.signatureHeader) {
    return { ok: false, status: 400, message: "Missing signature headers." };
  }

  const sent = Date.parse(args.timestampHeader);
  if (Number.isNaN(sent)) {
    return { ok: false, status: 400, message: "Malformed timestamp header." };
  }

  const now = (args.now ?? new Date()).getTime();
  // Absolute difference, so a clock ahead of ours is rejected too rather than
  // giving an attacker an unbounded future window.
  if (Math.abs(now - sent) > SIGNATURE_TOLERANCE_SECONDS * 1000) {
    return { ok: false, status: 401, message: "Timestamp outside tolerance." };
  }

  const expected = createHmac("sha256", secret)
    .update(`${args.timestampHeader}.${args.rawBody}`)
    .digest("hex");

  // Header format is `v1=<hex>`.
  const presented = args.signatureHeader.startsWith("v1=")
    ? args.signatureHeader.slice(3)
    : args.signatureHeader;

  if (!constantTimeEquals(presented, expected)) {
    return { ok: false, status: 401, message: "Signature mismatch." };
  }

  return { ok: true };
}
