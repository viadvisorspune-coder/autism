import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  careRelationships,
  consents,
  patients,
  users,
  type DataCategory,
} from "@/db/schema";

import {
  decideAccess,
  type AccessDecision,
  type AccessOperation,
  type ConsentFact,
  type RelationshipFact,
} from "./policy";

export interface LoadedAccessRequest {
  actorUserId: string;
  patientId: string;
  operation: AccessOperation;
  purpose: string;
  requestedCategories: DataCategory[];
  recipientUserId?: string;
}

/**
 * Load the facts a decision needs, then decide. Splitting the load from the
 * decision keeps `decideAccess` unit-testable without a database.
 */
export async function checkAccess(
  request: LoadedAccessRequest,
  now: Date = new Date(),
): Promise<AccessDecision> {
  const db = getDb();

  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, request.actorUserId))
    .limit(1);

  if (!actor) {
    return {
      decision: "deny",
      permittedCategories: [],
      deniedCategories: [],
      consentStatus: "missing",
      restrictions: [],
      reason: "The acting user does not exist.",
    };
  }

  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, request.patientId))
    .limit(1);

  if (!patient) {
    return {
      decision: "deny",
      permittedCategories: [],
      deniedCategories: [],
      consentStatus: "missing",
      restrictions: [],
      reason: "The patient record does not exist.",
    };
  }

  let relationship: RelationshipFact | null = null;
  if (actor.role === "clinician") {
    const [row] = await db
      .select()
      .from(careRelationships)
      .where(
        and(
          eq(careRelationships.patientId, request.patientId),
          eq(careRelationships.clinicianUserId, actor.id),
        ),
      )
      .limit(1);
    if (row) {
      relationship = { status: row.status, scope: row.scope };
    }
  }

  const consentRows = await db
    .select()
    .from(consents)
    .where(eq(consents.patientId, request.patientId));

  const consentFacts: ConsentFact[] = consentRows.map((c) => ({
    purpose: c.purpose,
    recipientUserId: c.recipientUserId,
    categories: c.categories,
    status: c.status,
    expiresAt: c.expiresAt,
  }));

  return decideAccess(
    {
      actor: {
        userId: actor.id,
        role: actor.role,
        disabled: actor.disabledAt !== null,
      },
      patientId: request.patientId,
      operation: request.operation,
      purpose: request.purpose,
      requestedCategories: request.requestedCategories,
      recipientUserId: request.recipientUserId,
    },
    {
      patientUserId: patient.userId,
      relationship,
      consents: consentFacts,
      now,
    },
  );
}
