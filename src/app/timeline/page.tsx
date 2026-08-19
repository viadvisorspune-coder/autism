import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { records } from "@/db/schema";
import { Card, Empty, Page, Provenance } from "@/components/ui";
import { currentPatientId, currentUser } from "@/lib/session";

export default async function TimelinePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const patientId = await currentPatientId(user.id);
  if (!patientId) redirect("/");

  const db = getDb();
  const rows = await db
    .select()
    .from(records)
    .where(
      and(eq(records.patientId, patientId), isNull(records.supersededAt)),
    )
    .orderBy(desc(records.occurredAt))
    .limit(100);

  return (
    <Page title="Your record" description="Everything kept about you, newest first.">
      {rows.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <time
                dateTime={row.occurredAt.toISOString()}
                className="text-sm text-ink-soft"
              >
                {row.occurredAt.toLocaleString()}
              </time>
              <Provenance value={row.provenance} />
            </div>
            <p className="mt-3 whitespace-pre-wrap">{row.body}</p>
            {row.structured && Object.keys(row.structured).length > 0 ? (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
                {Object.entries(row.structured).map(([key, value]) => (
                  <div key={key} className="flex gap-1.5">
                    <dt>{key.replace(/_/g, " ")}:</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {row.uncertaintyNote ? (
              <p className="mt-3 text-sm text-ink-soft">{row.uncertaintyNote}</p>
            ) : null}
          </Card>
        ))
      )}
    </Page>
  );
}
