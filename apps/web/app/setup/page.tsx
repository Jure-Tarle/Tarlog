/**
 * /setup, Erststart-Wizard (doc 05 §9.3, doc 02 §4). Legt GENAU EINEN
 * main_account an. Ist das Setup bereits abgeschlossen, existiert der Account
 * schon → weiter zum Login (der Wizard ist dann gesperrt).
 *
 * Server-Guard: liest den echten DB-Zustand (nicht nur das Cookie), damit ein
 * fehlendes/verfälschtes `ptl_setup`-Cookie den Wizard nicht wieder öffnet.
 * Auth-Seiten legen sich als eigenes Vollbild über die App-Shell (Layout).
 */
import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup";
import { AuthShell } from "./AuthShell";
import { SetupForm } from "./SetupForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SetupPage(): Promise<React.ReactElement> {
  if (await isSetupComplete()) redirect("/login");
  return (
    <AuthShell
      eyebrow="Erststart"
      title="Main Account anlegen"
      subtitle="Richte die Hauptperson für diesen Server ein. Das geht genau einmal."
    >
      <SetupForm />
    </AuthShell>
  );
}
