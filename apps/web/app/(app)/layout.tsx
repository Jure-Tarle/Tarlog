import { AppShell } from "@/lib/ui/AppShell";
import { redirect } from "next/navigation";
import { getOnboardingLaunch } from "@/lib/onboarding/state";
import { getTimer, requireAccount } from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const account = await requireAccount();
  const onboarding = await getOnboardingLaunch(account.id);
  if (onboarding.required) redirect("/onboarding");
  let timer = null;

  try {
    timer = await getTimer(account.id);
  } catch {
    // Die Shell bleibt auch verfügbar, wenn nur der Timer-Read fehlschlägt.
  }

  return (
    <AppShell
      account={{
        displayName: account.displayName,
        companyName: account.companyName,
      }}
      initialTimer={timer}
    >
      {children}
    </AppShell>
  );
}
