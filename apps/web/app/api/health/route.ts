/**
 * GET /api/health, Liveness + DB-Erreichbarkeit (doc 05 §9.4).
 *
 * Leichter `SELECT 1` gegen die Server-DB. Antwortet 200 `{ status: "ok" }`
 * bei erreichbarer DB, sonst 503 `{ status: "degraded" }`. Zusätzlich
 * `version` (aus package.json / Env) und `timestamp` (epoch-ms UTC).
 */
import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";

// Node-Runtime erzwingen (pg ist nicht Edge-kompatibel).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const timestamp = Date.now();
  let dbOk = false;
  try {
    dbOk = await pingDatabase();
  } catch {
    dbOk = false;
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      version: APP_VERSION,
      timestamp,
    },
    { status: dbOk ? 200 : 503 },
  );
}
