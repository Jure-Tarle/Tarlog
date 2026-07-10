/**
 * GET /api/health — Liveness + DB-Erreichbarkeit (doc 05 §9.4).
 *
 * Leichter `SELECT 1` gegen die Server-DB. Antwortet 200 `{ status: "ok" }`
 * bei erreichbarer DB, sonst 503 `{ status: "degraded" }`. Zusätzlich
 * `version` (aus package.json / Env) und `timestamp` (epoch-ms UTC).
 */
import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";

// Node-Runtime erzwingen (pg ist nicht Edge-kompatibel).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

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
      version: VERSION,
      timestamp,
    },
    { status: dbOk ? 200 : 503 },
  );
}
