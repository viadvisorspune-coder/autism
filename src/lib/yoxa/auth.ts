import { timingSafeEqual } from "node:crypto";

/**
 * Authentication for calls coming *from* Yoxa into this app.
 *
 * Yoxa's connector configuration stores one bearer token per connector; it is
 * entered in Yoxa after the OpenAPI file is uploaded and never appears in the
 * YAML, in source, or in a log line here.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

/**
 * Verify the Authorization header on a Yoxa connector request.
 *
 * A missing server-side token is a 500, not a 401: an unconfigured deployment
 * must fail loudly rather than quietly accepting or quietly rejecting traffic.
 */
export function authenticateYoxa(request: Request): AuthResult {
  const expected = process.env.YOXA_CONNECTOR_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 500,
      message: "YOXA_CONNECTOR_TOKEN is not configured on the server.",
    };
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing bearer token." };
  }

  const presented = header.slice("Bearer ".length).trim();
  if (!safeEqual(presented, expected)) {
    return { ok: false, status: 401, message: "Invalid bearer token." };
  }

  return { ok: true };
}
