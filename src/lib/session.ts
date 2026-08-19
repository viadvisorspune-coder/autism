import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { patients, users, type User } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * The current signed-in user, resolved from the Supabase session.
 *
 * `getUser()` is used rather than `getSession()` because it revalidates the
 * token with Supabase; a session read straight from the cookie is attacker
 * controllable.
 */
export async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return row ?? null;
}

/** The patient record belonging to the signed-in user, if they are a patient. */
export async function currentPatientId(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(patients)
    .where(eq(patients.userId, userId))
    .limit(1);
  return row?.id ?? null;
}
