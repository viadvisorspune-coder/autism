import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "@/lib/yoxa/signature";

const SECRET = "test-signing-secret";
const NOW = new Date("2026-05-01T12:00:00Z");

function sign(timestamp: string, body: string, secret = SECRET): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

beforeEach(() => {
  process.env.YOXA_HITL_WEBHOOK_SIGNING_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.YOXA_HITL_WEBHOOK_SIGNING_SECRET;
});

describe("verifyWebhookSignature", () => {
  const body = '{"event_id":"e1","event_type":"hitl.webhook_test"}';
  const ts = NOW.toISOString();

  it("accepts a correctly signed request", () => {
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: ts,
      signatureHeader: sign(ts, body),
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const r = verifyWebhookSignature({
      rawBody: body.replace("e1", "e2"),
      timestampHeader: ts,
      signatureHeader: sign(ts, body),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a signature made with a different secret", () => {
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: ts,
      signatureHeader: sign(ts, body, "wrong-secret"),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a replay outside the tolerance window", () => {
    const old = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: old,
      signatureHeader: sign(old, body),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a timestamp too far in the future", () => {
    const ahead = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: ahead,
      signatureHeader: sign(ahead, body),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts a bare hex signature without the v1= prefix", () => {
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: ts,
      signatureHeader: sign(ts, body).slice(3),
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing headers", () => {
    expect(
      verifyWebhookSignature({
        rawBody: body,
        timestampHeader: null,
        signatureHeader: sign(ts, body),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("fails loudly when the server has no signing secret configured", () => {
    delete process.env.YOXA_HITL_WEBHOOK_SIGNING_SECRET;
    const r = verifyWebhookSignature({
      rawBody: body,
      timestampHeader: ts,
      signatureHeader: sign(ts, body),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, status: 500 });
  });
});
