/**
 * app/api/invoices/[id]/pdf — PDF-Rechnung (doc 10 §5.1 Fn 23, §5.3 §14-UStG).
 *
 * Rendert die finalisierte (oder als Entwurf markierte) Rechnung über die
 * reine pdfmake-Dokumentdefinition (lib/pdf/invoice). Aussteller-/Kundenangaben
 * + Steuergruppen + §19/§13b-Hinweis. Audit `pdf_generated`.
 */
import { apiError, requireAuth } from "@/lib/api";
import { pool } from "@/lib/db";
import {
  buildInvoiceDocDefinition,
  formatMoneyCents,
  formatNumber,
  formatPercent,
  renderPdf,
  type InvoicePdfItem,
} from "@/lib/pdf";
import { actorId, computeTotals, getInvoiceWithItems, recordAudit, resolveIssuer } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const TYPE_LABEL: Record<string, string> = {
  standard: "Rechnung",
  partial: "Teilrechnung",
  final: "Schlussrechnung",
  cancellation: "Storno-Rechnung",
  credit_note: "Gutschrift",
};
const UNIT_LABEL: Record<string, string> = {
  hours: "Std.",
  days: "Tage",
  piece: "Stück",
  percent: "%",
};

export const GET = requireAuth<RouteCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const data = await getInvoiceWithItems(auth.main_account_id, id);
  if (!data) return apiError("not_found", "Rechnung nicht gefunden.");

  const inv = data.invoice as Record<string, unknown>;
  const issuer = await resolveIssuer(auth.main_account_id);
  const currency = String(inv.currency ?? issuer.currency);
  const locale = issuer.locale;
  const isDraft = inv.status === "draft";
  const cust = (inv.customer_snapshot ?? {}) as Record<string, unknown>;

  // Posten aufbereiten (formatiert).
  const items: InvoicePdfItem[] = data.items.map((row, i) => {
    const r = row as Record<string, unknown>;
    const unitPrice = Number(r.unit_price_cents ?? 0);
    const net = Number(r.net_amount_cents ?? 0);
    const taxRate = Number(r.tax_rate ?? 0);
    return {
      position: Number(r.position ?? i + 1),
      description: String(r.description ?? ""),
      quantity: formatNumber(Number(r.quantity ?? 0), locale),
      unit: UNIT_LABEL[String(r.unit)] ?? String(r.unit ?? ""),
      unitPrice: formatMoneyCents(unitPrice, currency, locale),
      net: formatMoneyCents(net, currency, locale),
      taxRate: formatPercent(taxRate, locale),
    };
  });

  // Steuergruppen aus den Posten (§14 Nr. 8/9).
  const totals = computeTotals(
    data.items.map((row) => {
      const r = row as Record<string, unknown>;
      return { net_amount_cents: Number(r.net_amount_cents ?? 0), tax_rate: Number(r.tax_rate ?? 0) };
    }),
  );

  const issuerName = issuer.company_name ?? issuer.display_name;
  const issuerTaxLine = issuer.tax_number
    ? `Steuernr./USt-IdNr.: ${issuer.tax_number}`
    : issuer.vat_id
      ? `USt-IdNr.: ${issuer.vat_id}`
      : null;

  const servicePeriod =
    inv.service_period_start && inv.service_period_end
      ? `${String(inv.service_period_start)} – ${String(inv.service_period_end)}`
      : null;

  const docDefinition = buildInvoiceDocDefinition({
    issuer: { name: issuerName, address: issuer.address, taxLine: issuerTaxLine, email: issuer.email },
    customer: {
      name: (cust.company as string) ?? (cust.name as string) ?? "—",
      address: (cust.billing_address as string) ?? null,
      vatId: (cust.vat_id as string) ?? null,
      number: (cust.customer_number as string) ?? null,
    },
    invoiceNumber: (inv.invoice_number as string) ?? "ENTWURF",
    issueDate: String(inv.issue_date ?? ""),
    servicePeriod,
    serviceDate: (inv.service_date as string) ?? null,
    dueDate: (inv.payment_due_date as string) ?? null,
    currency,
    typeLabel: `${TYPE_LABEL[String(inv.type)] ?? "Rechnung"}${isDraft ? " (Entwurf)" : ""}`,
    items,
    taxGroups: totals.groups.map((g) => ({
      label: formatPercent(g.tax_rate, locale),
      net: formatMoneyCents(g.net_cents, currency, locale),
      tax: formatMoneyCents(g.tax_cents, currency, locale),
    })),
    totals: {
      net: formatMoneyCents(Number(inv.net_amount_cents ?? totals.net_cents), currency, locale),
      tax: formatMoneyCents(Number(inv.tax_amount_cents ?? totals.tax_cents), currency, locale),
      gross: formatMoneyCents(Number(inv.gross_amount_cents ?? totals.gross_cents), currency, locale),
    },
    taxNote: (inv.small_business_note as string) ?? (inv.reverse_charge_note as string) ?? null,
    footerNote: (inv.notes as string) ?? null,
    isDraft,
  });

  const pdf = await renderPdf(docDefinition);

  await recordAudit(pool, {
    main_account_id: auth.main_account_id,
    actor_id: actorId(auth),
    device_id: auth.device_id ?? null,
    entity_type: "invoices",
    entity_id: id,
    action: "pdf_generated",
    after: { document: "invoice_pdf", invoice_number: inv.invoice_number ?? null },
    source: "api",
  });

  const filename = `${(inv.invoice_number as string) ?? "entwurf"}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
