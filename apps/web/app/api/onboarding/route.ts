import { z } from "zod";
import { ONBOARDING_STEPS } from "@tarlog/core";
import { json, parseJson, requireAuth } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/http";
import {
  createOnboardingWorkspace,
  getOnboardingLaunch,
  mutateOnboarding,
} from "@/lib/onboarding/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const progressSchema = z.object({
  action: z.literal("progress"),
  step: z.enum(ONBOARDING_STEPS),
  customerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

const mutationSchema = z.discriminatedUnion("action", [
  progressSchema,
  z.object({ action: z.literal("complete") }),
]);

const nullableCents = z.number().int().nonnegative().safe().nullable();
const workspaceSchema = z.object({
  customerId: z.string().uuid().nullable(),
  customer: z.object({
    name: z.string().trim().min(1).max(240),
    company: z.string().trim().max(240).nullable(),
    defaultHourlyRateCents: nullableCents,
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  }).nullable(),
  project: z.object({
    name: z.string().trim().min(1).max(240),
    billingType: z.enum([
      "hourly",
      "day_rate",
      "fixed_fee",
      "retainer",
      "non_billable",
    ]),
    hourlyRateCents: nullableCents,
    dayRateCents: nullableCents,
    fixedFeeCents: nullableCents,
    roundingRuleId: z.string().uuid().nullable(),
    descriptionRequired: z.boolean(),
  }),
}).refine((value) => !(value.customerId && value.customer), {
  message: "Bestehender und neuer Kunde können nicht gleichzeitig gewählt werden.",
});

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const launch = await getOnboardingLaunch(auth.main_account_id);
  return json(launch);
});

export const PATCH = requireAuth(async (req, _ctx, auth) => {
  assertSameOrigin(req);
  const mutation = await parseJson(req, mutationSchema);
  const launch = await mutateOnboarding(auth.main_account_id, mutation);
  return json(launch);
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  assertSameOrigin(req);
  const input = await parseJson(req, workspaceSchema);
  const result = await createOnboardingWorkspace(auth.main_account_id, input);
  return json(result, { status: 201 });
});
