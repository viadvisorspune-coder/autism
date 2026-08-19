import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { getDb } from "@/db";
import { approvals } from "@/db/schema";
import { Card, Page } from "@/components/ui";
import { currentUser } from "@/lib/session";

import { DecisionForm } from "./decision-form";

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = getDb();
  // Scoped by assignee, so someone else's approval is a 404 rather than a 403 —
  // an error page should not confirm that a decision exists for another person.
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.assignedToUserId, user.id)))
    .limit(1);

  if (!approval) notFound();

  const description =
    typeof approval.proposedContent?.description === "string"
      ? approval.proposedContent.description
      : null;

  return (
    <Page title={approval.prompt}>
      {description ? (
        <Card>
          <p className="whitespace-pre-wrap">{description}</p>
        </Card>
      ) : null}

      {approval.disclosureCategories &&
      approval.disclosureCategories.length > 0 ? (
        <Card>
          <p className="font-medium">What this would share</p>
          <ul className="mt-2 list-disc pl-5 text-ink-soft">
            {approval.disclosureCategories.map((c) => (
              <li key={c}>{c.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {approval.status === "pending" ? (
        <DecisionForm
          approvalId={approval.id}
          options={approval.options ?? []}
        />
      ) : (
        <Card>
          <p>
            You already answered this: {approval.status.replace(/_/g, " ")}.
          </p>
        </Card>
      )}
    </Page>
  );
}
