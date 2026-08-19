import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { approvals } from "@/db/schema";
import { Card, Empty, Page } from "@/components/ui";
import { currentUser } from "@/lib/session";

export default async function ApprovalsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.assignedToUserId, user.id))
    .orderBy(desc(approvals.createdAt))
    .limit(50);

  const pending = rows.filter((r) => r.status === "pending");
  const answered = rows.filter((r) => r.status !== "pending");

  return (
    <Page
      title="Decisions for you"
      description="Nothing is shared or acted on until you say so."
    >
      {pending.length === 0 ? (
        <Empty>Nothing is waiting on you.</Empty>
      ) : (
        pending.map((row) => (
          <Card key={row.id} tone="attention">
            <p className="font-medium">{row.prompt}</p>
            <Link
              href={`/approvals/${row.id}`}
              className="mt-3 inline-block underline underline-offset-4"
            >
              Review and decide
            </Link>
          </Card>
        ))
      )}

      {answered.length > 0 ? (
        <div className="pt-4">
          <h2 className="text-sm font-medium text-ink-soft">Already answered</h2>
          <ul className="mt-3 space-y-2">
            {answered.map((row) => (
              <li key={row.id} className="text-ink-soft">
                {row.prompt} — {row.status.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Page>
  );
}
