import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as postgresSchema from "./schema.pg";

// The two drivers expose the same query surface to the ledger route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return drizzleNeon(neon(databaseUrl), { schema: postgresSchema });
}
