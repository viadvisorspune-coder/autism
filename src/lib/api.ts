import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { authenticateYoxa } from "@/lib/yoxa/auth";

/**
 * Shared request handling for the Yoxa-facing routes.
 *
 * Every connector endpoint has the same outer shape: authenticate, parse JSON
 * against a schema, run, and return a documented envelope. Yoxa validates live
 * responses against the schema in the uploaded OpenAPI file, so these envelopes
 * must stay stable and fully described.
 */

export interface ErrorBody {
  error: string;
  detail?: string;
}

export function errorResponse(
  status: number,
  error: string,
  detail?: string,
): NextResponse<ErrorBody> {
  return NextResponse.json<ErrorBody>(
    detail ? { error, detail } : { error },
    { status },
  );
}

/**
 * Authenticate, then parse and validate the JSON body.
 *
 * Returns either the parsed value or a ready-to-return error response, so a
 * route body reads as a single early-return chain.
 */
export async function readYoxaRequest<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { response: NextResponse<ErrorBody> }> {
  const auth = authenticateYoxa(request);
  if (!auth.ok) {
    return { response: errorResponse(auth.status, auth.message) };
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: errorResponse(400, "Request body is not valid JSON.") };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: errorResponse(
        422,
        "Request body failed validation.",
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      ),
    };
  }

  return { data: parsed.data };
}
