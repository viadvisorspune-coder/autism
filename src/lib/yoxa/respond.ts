/**
 * Sending a human's decision back to Yoxa.
 *
 * The Yoxa origin is derived from YOXA_TRIGGER_URL rather than configured
 * separately, so there is one source of truth for where Yoxa lives and no empty
 * optional variable that could override it.
 */

export interface RespondResult {
  ok: boolean;
  /** 202 = stored and resume queued. 200 = already answered. */
  status: number;
  alreadyAnswered: boolean;
  detail?: string;
}

function yoxaOrigin(): string {
  const triggerUrl = process.env.YOXA_TRIGGER_URL;
  if (!triggerUrl) {
    throw new Error("YOXA_TRIGGER_URL is not configured on the server.");
  }
  return new URL(triggerUrl).origin;
}

export async function sendHitlDecision(args: {
  deploymentId: string;
  /** Yoxa's HITL request id — not this app's approval row id. */
  requestId: string;
  selectedOptionId?: string;
  overrideMessage?: string;
}): Promise<RespondResult> {
  const secret = process.env.YOXA_HITL_RESPONSE_SECRET;
  if (!secret) {
    throw new Error("YOXA_HITL_RESPONSE_SECRET is not configured on the server.");
  }

  const hasOption = Boolean(args.selectedOptionId);
  const hasOverride = Boolean(args.overrideMessage);
  if (hasOption === hasOverride) {
    throw new Error(
      "Send exactly one of selectedOptionId or overrideMessage.",
    );
  }

  const url =
    `${yoxaOrigin()}/api/v1/public/workflow-deployments/` +
    `${encodeURIComponent(args.deploymentId)}/hitl/requests/` +
    `${encodeURIComponent(args.requestId)}/respond`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yoxa-HITL-Response-Secret": secret,
    },
    body: JSON.stringify(
      hasOption
        ? { selected_option_id: args.selectedOptionId }
        : { override_message: args.overrideMessage },
    ),
  });

  // Read the body for diagnostics, but never log the secret or the headers.
  const detail = await response.text().catch(() => "");

  return {
    ok: response.status === 202 || response.status === 200,
    status: response.status,
    alreadyAnswered: response.status === 200,
    detail: detail.slice(0, 500) || undefined,
  };
}
