/**
 * Customers — Kundenliste + Anlageformular (doc 06 A.2). Reads/writes gehen über
 * data/customers (Bridge-Command + lokale Patches); keine eigenen DB-Zugriffe.
 */
import { useState } from "react";
import {
  Page, Card, Button, Field, FormRow, TextInput, Select, AsyncBody, EmptyState, TableWrap, Tag, ErrorNote,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { listCustomers, createCustomer, archiveCustomer } from "../data/customers";
import { fmtMoney } from "../data/format";

function toCents(euro: string): number | null {
  const v = parseFloat(euro.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export default function Customers() {
  const [status, setStatus] = useState<string>("active");
  const list = useAsync(() => listCustomers(status === "all" ? null : status), [status]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Name ist erforderlich."); return; }
    setBusy(true);
    try {
      await createCustomer({
        name: name.trim(),
        company: company || null,
        email: email || null,
        customer_number: number || null,
        default_hourly_rate_cents: rate ? toCents(rate) : null,
        payment_term_days: parseInt(term, 10) || 14,
      });
      setName(""); setCompany(""); setEmail(""); setNumber(""); setRate(""); setTerm("14");
      setOpen(false);
      list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <Page
      title="Kunden"
      hint="Kundenverwaltung"
      actions={
        <>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
            <option value="active">Aktiv</option>
            <option value="paused">Pausiert</option>
            <option value="archived">Archiviert</option>
            <option value="all">Alle</option>
          </Select>
          <Button variant="primary" onClick={() => setOpen((o) => !o)}>{open ? "Schließen" : "Neuer Kunde"}</Button>
        </>
      }
    >
      {open ? (
        <Card title="Neuer Kunde">
          {error ? <ErrorNote error={error} /> : null}
          <div className="stack">
            <FormRow>
              <Field label="Name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
              <Field label="Firma"><TextInput value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
              <Field label="Kundennummer"><TextInput value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
            </FormRow>
            <FormRow>
              <Field label="E-Mail"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Stundensatz (€)" hint="optional"><TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0,00" /></Field>
              <Field label="Zahlungsziel (Tage)"><TextInput type="number" value={term} onChange={(e) => setTerm(e.target.value)} /></Field>
            </FormRow>
            <div className="cluster">
              <Button variant="primary" disabled={busy} onClick={() => void save()}>Speichern</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Kunden" subtitle={`${list.data?.length ?? 0} Einträge`}>
        <AsyncBody state={{ data: list.data, error: list.error, loading: list.loading }} empty={<EmptyState title="Keine Kunden">Lege den ersten Kunden an.</EmptyState>}>
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Name</th><th>Firma</th><th>Nr.</th><th className="right">Satz</th><th>Status</th><th className="right">Aktion</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="muted">{c.company || "—"}</td>
                      <td className="num faint">{c.customer_number || "—"}</td>
                      <td className="right num">{c.default_hourly_rate_cents != null ? fmtMoney(c.default_hourly_rate_cents, c.default_currency) : "—"}</td>
                      <td><Tag tone={c.status === "active" ? "accent" : "muted"}>{c.status}</Tag></td>
                      <td className="right">
                        {c.status !== "archived" ? (
                          <Button variant="ghost" className="btn--sm" onClick={() => void archiveCustomer(c.id).then(() => list.reload())}>Archivieren</Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </AsyncBody>
      </Card>
    </Page>
  );
}
