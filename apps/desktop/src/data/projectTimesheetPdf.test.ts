import { describe, expect, it } from "vitest";
import { buildProjectTimesheetDefinition, renderProjectTimesheetPdf } from "./projectTimesheetPdf";

const input = {
  project: { id: "01890000-0000-7000-8000-000000000101", main_account_id: "01890000-0000-7000-8000-000000000001", name: "Relaunch", billing_type: "hourly" as const, status: "active" as const, description_required: false, backdating_allowed: true, backdating_reason_required: false, max_retroactive_edit_days: 365, created_at: 1, updated_at: 1 },
  customer: { id: "01890000-0000-7000-8000-000000000201", main_account_id: "01890000-0000-7000-8000-000000000001", name: "Ada Lovelace", first_name: "Ada", last_name: "Lovelace", payment_term_days: 14, default_currency: "EUR", default_tax_rate: 19, reverse_charge_hint: false, small_business_hint: false, preferred_export_detail: "detailed" as const, status: "active" as const, created_at: 1, updated_at: 1 },
  entries: [{ id: "01890000-0000-7000-8000-000000000301", main_account_id: "01890000-0000-7000-8000-000000000001", project_id: "01890000-0000-7000-8000-000000000101", status: "stopped" as const, timezone: "Europe/Berlin", actual_started_at: 1_784_112_400_000, actual_ended_at: 1_784_116_000_000, actual_duration_seconds: 3600, break_duration_seconds: 0, net_work_duration_seconds: 3600, billing_duration_seconds: 3600, rounding_delta_seconds: 0, calculation_version: 1, description: "Konzept", is_billable: true, client_visible: true, is_backdated: false, crosses_midnight: false, clock_trust: "trusted" as const, source: "live_timer" as const, created_at: 1, updated_at: 1 }],
  timezone: "Europe/Berlin",
};

describe("project timesheet PDF", () => {
  it("contains the full detail table and renders a valid PDF", async () => {
    const definition = JSON.stringify(buildProjectTimesheetDefinition(input));
    expect(definition).toContain("Konzept");
    expect(definition).not.toContain("Status");
    expect(definition).not.toContain("abrechenbar");
    const bytes = await renderProjectTimesheetPdf(input);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});
