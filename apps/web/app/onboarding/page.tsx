import { redirect } from "next/navigation";
import { getOnboardingLaunch } from "@/lib/onboarding/state";
import {
  listCustomers,
  listProjects,
  listRoundingRules,
  requireAccount,
} from "@/lib/ui/queries";
import { OnboardingWizard } from "./OnboardingWizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}): Promise<React.ReactElement> {
  const account = await requireAccount();
  const replayRequested = (await searchParams).replay === "1";
  const launch = await getOnboardingLaunch(account.id);
  const replay = replayRequested && !launch.required;

  if (!launch.show && !replayRequested) redirect("/dashboard");

  const [customers, projects, rules] = await Promise.all([
    listCustomers(account.id),
    listProjects(account.id),
    listRoundingRules(account.id),
  ]);

  return (
    <OnboardingWizard
      accountName={account.displayName}
      currency={account.currency}
      launch={launch}
      replay={replay}
      customers={customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        company: customer.company,
      }))}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        customerId: project.customer_id,
        customerName: project.customerName,
        billingType: project.billing_type,
      }))}
      rules={rules.map((rule) => ({ id: rule.id, name: rule.name }))}
    />
  );
}
