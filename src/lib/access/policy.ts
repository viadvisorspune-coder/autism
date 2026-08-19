import type { DataCategory, UserRole } from "@/db/schema";

/**
 * The access decision, as a pure function.
 *
 * This file deliberately has no database import and no model call. "Is this
 * clinician allowed to see the psychiatrist's note?" is answered here, from
 * facts loaded by the caller, and the answer is the same every time it is
 * asked. Yoxa's Safety & Consent agent may *assess* an action; this decides it.
 */

export type AccessOperation = "read" | "write" | "disclose";

export interface AccessActor {
  userId: string;
  role: UserRole;
  disabled: boolean;
}

export interface AccessRequest {
  actor: AccessActor;
  patientId: string;
  operation: AccessOperation;
  /** Why the data is wanted. Matched against consent purposes for disclosure. */
  purpose: string;
  requestedCategories: DataCategory[];
  /** Required when operation is 'disclose'. */
  recipientUserId?: string;
}

export interface RelationshipFact {
  status: "pending" | "active" | "revoked";
  scope: DataCategory[];
}

export interface ConsentFact {
  purpose: string;
  recipientUserId: string | null;
  categories: DataCategory[];
  status: "active" | "revoked" | "expired";
  expiresAt: Date | null;
}

export interface AccessFacts {
  /** The user id that owns this patient record, if the patient has a login. */
  patientUserId: string | null;
  /** The actor's care relationship to this patient, if any. */
  relationship: RelationshipFact | null;
  /** All consent rows for this patient. Filtering happens here, not in SQL. */
  consents: ConsentFact[];
  now: Date;
}

export type AccessOutcome = "allow" | "allow_with_scope" | "deny";

export type ConsentState =
  | "not_required"
  | "active"
  | "missing"
  | "revoked"
  | "expired";

export interface AccessDecision {
  decision: AccessOutcome;
  /** Categories the caller may actually use. Never wider than requested. */
  permittedCategories: DataCategory[];
  /** Requested categories that were withheld, so the caller can explain why. */
  deniedCategories: DataCategory[];
  consentStatus: ConsentState;
  /** Plain-language constraints the caller must honour. */
  restrictions: string[];
  /** Plain-language reason, safe to show a human and to write to the audit log. */
  reason: string;
}

function deny(reason: string, consentStatus: ConsentState = "missing"): AccessDecision {
  return {
    decision: "deny",
    permittedCategories: [],
    deniedCategories: [],
    consentStatus,
    restrictions: [],
    reason,
  };
}

function intersect(a: DataCategory[], b: DataCategory[]): DataCategory[] {
  const set = new Set(b);
  return a.filter((c) => set.has(c));
}

function difference(a: DataCategory[], b: DataCategory[]): DataCategory[] {
  const set = new Set(b);
  return a.filter((c) => !set.has(c));
}

/** Purposes are compared case-insensitively and trimmed; nothing fancier. */
function purposeMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function consentIsLive(c: ConsentFact, now: Date): boolean {
  if (c.status !== "active") return false;
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Decide one access request.
 *
 * Order matters: identity, then relationship, then consent, then scope. A
 * failure at any level stops the request rather than being traded off against a
 * later success.
 */
export function decideAccess(
  request: AccessRequest,
  facts: AccessFacts,
): AccessDecision {
  const { actor, requestedCategories, operation } = request;

  if (actor.disabled) {
    return deny("The acting account is disabled.");
  }

  if (requestedCategories.length === 0) {
    return deny("No data categories were requested.", "not_required");
  }

  const isSelf =
    facts.patientUserId !== null && facts.patientUserId === actor.userId;

  // --- The patient acting on their own record -------------------------------
  if (actor.role === "patient") {
    if (!isSelf) {
      return deny(
        "A patient may only access their own record.",
      );
    }

    if (operation !== "disclose") {
      return {
        decision: "allow",
        permittedCategories: [...requestedCategories],
        deniedCategories: [],
        consentStatus: "not_required",
        restrictions: [],
        reason:
          "The patient is acting on their own record for their own purpose.",
      };
    }

    // Disclosure by the patient is the patient exercising their own authority,
    // so no third-party consent is needed — but a recipient must be named, or
    // there is nothing to authorise.
    if (!request.recipientUserId) {
      return deny(
        "A disclosure must name a recipient.",
        "not_required",
      );
    }

    return {
      decision: "allow",
      permittedCategories: [...requestedCategories],
      deniedCategories: [],
      consentStatus: "not_required",
      restrictions: [
        "Record this disclosure and its recipient in the audit trail.",
      ],
      reason: "The patient is authorising disclosure of their own record.",
    };
  }

  // --- A clinician acting on someone else's record --------------------------
  if (actor.role === "clinician") {
    const rel = facts.relationship;
    if (!rel) {
      return deny(
        "No care relationship exists between this clinician and this patient.",
      );
    }
    if (rel.status === "pending") {
      return deny(
        "The care relationship has not been accepted by the patient yet.",
      );
    }
    if (rel.status === "revoked") {
      return deny("The patient has ended this care relationship.", "revoked");
    }

    // The relationship is the outer bound. Nothing widens it.
    const withinRelationship = intersect(requestedCategories, rel.scope);
    if (withinRelationship.length === 0) {
      return deny(
        "None of the requested categories fall within this care relationship's scope.",
      );
    }

    const relevant = facts.consents.filter((c) => {
      if (!purposeMatches(c.purpose, request.purpose)) return false;
      // A consent naming no recipient covers the whole care team; one naming a
      // recipient covers only that person.
      if (c.recipientUserId && c.recipientUserId !== actor.userId) return false;
      return true;
    });

    if (relevant.length === 0) {
      return deny(
        `No consent covers the purpose "${request.purpose}" for this clinician.`,
      );
    }

    const live = relevant.filter((c) => consentIsLive(c, facts.now));
    if (live.length === 0) {
      const expired = relevant.some(
        (c) =>
          c.status === "expired" ||
          (c.expiresAt !== null && c.expiresAt.getTime() <= facts.now.getTime()),
      );
      return deny(
        expired
          ? "The consent covering this purpose has expired."
          : "The patient has revoked consent for this purpose.",
        expired ? "expired" : "revoked",
      );
    }

    const consented = live.flatMap((c) => c.categories);
    const permitted = intersect(withinRelationship, consented);

    if (permitted.length === 0) {
      return deny(
        "Consent exists for this purpose but covers none of the requested categories.",
      );
    }

    const denied = difference(requestedCategories, permitted);
    const restrictions = [
      "Use only the permitted categories; discard the rest rather than inferring around them.",
    ];
    if (denied.includes("clinical")) {
      restrictions.push(
        "Clinical information is outside this authorisation and must not be quoted or paraphrased.",
      );
    }

    return {
      decision: denied.length > 0 ? "allow_with_scope" : "allow",
      permittedCategories: permitted,
      deniedCategories: denied,
      consentStatus: "active",
      restrictions,
      reason:
        denied.length > 0
          ? "Allowed, narrowed to the categories covered by both the care relationship and active consent."
          : "Allowed: an active care relationship and consent cover every requested category.",
    };
  }

  // Unreachable while userRole has exactly two values, but a new role must not
  // silently inherit access.
  return deny("This role has no defined access path.");
}

/**
 * Minimum-necessary filter, backing the workflow's Data Scope & Minimisation
 * step. Given what a purpose genuinely needs and what was asked for, return the
 * smaller set.
 */
export function minimumNecessary(
  requested: DataCategory[],
  neededForPurpose: DataCategory[],
): { keep: DataCategory[]; drop: DataCategory[] } {
  const keep = intersect(requested, neededForPurpose);
  return { keep, drop: difference(requested, keep) };
}
