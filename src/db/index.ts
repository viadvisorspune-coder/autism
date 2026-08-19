import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __orcaSql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  // Supabase's transaction-mode pooler does not support prepared statements,
  // and serverless functions must not each open their own large pool. Both
  // matter on Vercel: point DATABASE_URL at the pooler (port 6543).
  globalThis.__orcaSql ??= postgres(url, { max: 5, prepare: false });
  return globalThis.__orcaSql;
}

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  cached ??= drizzle(connect(), { schema });
  return cached;
}

export { schema };
