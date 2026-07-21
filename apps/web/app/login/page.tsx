/**
 * /login, Session-Login am eigenen Server (doc 05 §5.1). Guards:
 *  - Setup noch nicht abgeschlossen → zum Erststart-Wizard (/setup).
 *  - Bereits angemeldet → direkt ins Dashboard.
 */
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/api";
import { isSetupComplete } from "@/lib/auth/setup";
import { AuthShell } from "../setup/AuthShell";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage(): Promise<React.ReactElement> {
  if (!(await isSetupComplete())) redirect("/setup");
  if (await getAuth()) redirect("/dashboard");
  return (
    <AuthShell
      eyebrow="Anmeldung"
      title="Willkommen zurück"
      subtitle="Melde dich an deinem Project-Time-Ledger-Server an."
    >
      <LoginForm />
    </AuthShell>
  );
}
