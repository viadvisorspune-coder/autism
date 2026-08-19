import { describe, expect, it } from "vitest";

import {
  decideAccess,
  minimumNecessary,
  type AccessFacts,
  type AccessRequest,
} from "@/lib/access/policy";

const NOW = new Date("2026-05-01T12:00:00Z");
const PATIENT_USER = "11111111-1111-1111-1111-111111111111";
const CLINICIAN_USER = "22222222-2222-2222-2222-222222222222";
const OTHER_CLINICIAN = "33333333-3333-3333-3333-333333333333";
const PATIENT_ID = "44444444-4444-4444-4444-444444444444";

function request(over: Partial<AccessRequest> = {}): AccessRequest {
  return {
    actor: { userId: CLINICIAN_USER, role: "clinician", disabled: false },
    patientId: PATIENT_ID,
    operation: "read",
    purpose: "appointment_preparation",
    requestedCategories: ["functional", "support"],
    ...over,
  };
}

function facts(over: Partial<AccessFacts> = {}): AccessFacts {
  return {
    patientUserId: PATIENT_USER,
    relationship: { status: "active", scope: ["functional", "support", "clinical"] },
    consents: [
      {
        purpose: "appointment_preparation",
        recipientUserId: null,
        categories: ["functional", "support"],
        status: "active",
        expiresAt: null,
      },
    ],
    now: NOW,
    ...over,
  };
}

describe("patients acting on their own record", () => {
  it("allows every requested category without needing consent", () => {
    const d = decideAccess(
      request({
        actor: { userId: PATIENT_USER, role: "patient", disabled: false },
        requestedCategories: ["clinical", "personal"],
      }),
      facts(),
    );
    expect(d.decision).toBe("allow");
    expect(d.consentStatus).toBe("not_required");
    expect(d.permittedCategories).toEqual(["clinical", "personal"]);
  });

  it("refuses a patient reaching into someone else's record", () => {
    const d = decideAccess(
      request({
        actor: { userId: "99999999-9999-9999-9999-999999999999", role: "patient", disabled: false },
      }),
      facts(),
    );
    expect(d.decision).toBe("deny");
  });

  it("requires a named recipient before disclosing", () => {
    const d = decideAccess(
      request({
        actor: { userId: PATIENT_USER, role: "patient", disabled: false },
        operation: "disclose",
      }),
      facts(),
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toMatch(/recipient/i);
  });
});

describe("clinicians", () => {
  it("allows what relationship and consent both cover", () => {
    const d = decideAccess(request(), facts());
    expect(d.decision).toBe("allow");
    expect(d.permittedCategories).toEqual(["functional", "support"]);
    expect(d.deniedCategories).toEqual([]);
  });

  it("narrows rather than refuses when consent is partial", () => {
    const d = decideAccess(
      request({ requestedCategories: ["functional", "clinical"] }),
      facts(),
    );
    expect(d.decision).toBe("allow_with_scope");
    expect(d.permittedCategories).toEqual(["functional"]);
    expect(d.deniedCategories).toEqual(["clinical"]);
    expect(d.restrictions.join(" ")).toMatch(/clinical/i);
  });

  it("denies with no care relationship at all", () => {
    const d = decideAccess(request(), facts({ relationship: null }));
    expect(d.decision).toBe("deny");
  });

  it("denies while the relationship is only pending", () => {
    const d = decideAccess(
      request(),
      facts({ relationship: { status: "pending", scope: ["functional"] } }),
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toMatch(/not been accepted/i);
  });

  it("denies once the patient revokes the relationship", () => {
    const d = decideAccess(
      request(),
      facts({ relationship: { status: "revoked", scope: ["functional"] } }),
    );
    expect(d.decision).toBe("deny");
    expect(d.consentStatus).toBe("revoked");
  });

  it("denies for a purpose no consent covers", () => {
    const d = decideAccess(
      request({ purpose: "research_study" }),
      facts(),
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toMatch(/research_study/);
  });

  it("treats an expired consent as expired, not active", () => {
    const d = decideAccess(
      request(),
      facts({
        consents: [
          {
            purpose: "appointment_preparation",
            recipientUserId: null,
            categories: ["functional"],
            status: "active",
            expiresAt: new Date("2026-04-01T00:00:00Z"),
          },
        ],
      }),
    );
    expect(d.decision).toBe("deny");
    expect(d.consentStatus).toBe("expired");
  });

  it("does not let one clinician use consent naming a different clinician", () => {
    const d = decideAccess(
      request(),
      facts({
        consents: [
          {
            purpose: "appointment_preparation",
            recipientUserId: OTHER_CLINICIAN,
            categories: ["functional", "support"],
            status: "active",
            expiresAt: null,
          },
        ],
      }),
    );
    expect(d.decision).toBe("deny");
  });

  it("never exceeds the relationship scope even with broader consent", () => {
    const d = decideAccess(
      request({ requestedCategories: ["functional", "clinical"] }),
      facts({
        relationship: { status: "active", scope: ["functional"] },
        consents: [
          {
            purpose: "appointment_preparation",
            recipientUserId: null,
            categories: ["functional", "clinical", "personal"],
            status: "active",
            expiresAt: null,
          },
        ],
      }),
    );
    expect(d.permittedCategories).toEqual(["functional"]);
    expect(d.deniedCategories).toEqual(["clinical"]);
  });

  it("matches purposes case-insensitively", () => {
    const d = decideAccess(
      request({ purpose: "  Appointment_Preparation " }),
      facts(),
    );
    expect(d.decision).toBe("allow");
  });
});

describe("guards that apply to everyone", () => {
  it("denies a disabled account", () => {
    const d = decideAccess(
      request({ actor: { userId: PATIENT_USER, role: "patient", disabled: true } }),
      facts(),
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toMatch(/disabled/i);
  });

  it("denies an empty category request", () => {
    const d = decideAccess(request({ requestedCategories: [] }), facts());
    expect(d.decision).toBe("deny");
  });
});

describe("minimumNecessary", () => {
  it("keeps the overlap and reports what it dropped", () => {
    const { keep, drop } = minimumNecessary(
      ["functional", "clinical", "personal"],
      ["functional", "personal", "outcome"],
    );
    expect(keep).toEqual(["functional", "personal"]);
    expect(drop).toEqual(["clinical"]);
  });
});
