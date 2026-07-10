/**
 * GET /api/auth/session — Session-Check (doc 05 §5.1). Weicher Check: 200 mit
 * `{ authenticated: false }` wenn keine gültige Session/kein gültiges Token,
 * damit Clients den Zustand abfragen können, ohne 401 behandeln zu müssen.
 * Deckt Cookie- UND Bearer-Auth ab (über `getAuth`).
 */
import { type NextRequest } from "next/server";
import { getAuth, json } from "@/lib/api";
import { publicRoute } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute(async (_req: NextRequest) => {
  const auth = await getAuth();
  if (!auth) return json({ authenticated: false });
  return json({
    authenticated: true,
    main_account_id: auth.main_account_id,
    session_id: auth.session_id ?? null,
    device_id: auth.device_id ?? null,
    user_id: auth.user_id ?? null,
  });
});
