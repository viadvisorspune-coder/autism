import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { careRelationships, patients, users } from "@/db/schema";
import { Card, Empty, Page } from "@/components/ui";
import { currentUser } from "@/lib/session";

export default async function ClinicianPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "clinician") redirect("/");

  const db = getDb();
  // Only active relationships. A pending or revoked one must not even reveal
  // that the patient exists.
  const rows = await db
    .select({
      patientId: patients.id,
      name: users.displayName,
      scope: careRelationships.scope,
    })
    .from(careRelationships)
    .innerJoin(patients, eq(patients.id, careRelationships.patientId))
    .innerJoin(users, eq(users.id, patients.userId))
    .where(
      and(
        eq(careRelationships.clinicianUserId, user.id),
        eq(careRelationships.status, "active"),
      ),
    );

  return (
    <Page
      title="Your patients"
      description="You see only what each person has agreed to share, for the purpose they agreed to."
    >
      {rows.length === 0 ? (
        <Empty>No active care relationships.</Empty>
      ) : (
        rows.map((row) => (
          <Card key={row.patientId}>
            <p className="font-medium">{row.name}</p>
            <p className="mt-1 text-sm text-ink-soft">
              Shared with you: {row.scope.join(", ")}
            </p>
          </Card>
        ))
      )}
    </Page>
  );
}
