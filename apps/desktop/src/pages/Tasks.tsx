/**
 * Aufgaben — Bereich 8 (doc 06 A.2 `tasks`). Liste der Tätigkeitsarten
 * (global oder projektbezogen) über die lokale data-Schicht.
 */
import { Page, Card, AsyncBody, EmptyState, TableWrap, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { listTasks } from "../data/tasks";

export default function Tasks() {
  const list = useAsync(() => listTasks(null), []);

  return (
    <Page title="Aufgaben" hint="Tätigkeitsarten — global oder projektbezogen">
      <Card title="Aufgaben" subtitle={`${list.data?.length ?? 0} Einträge`}>
        <AsyncBody
          state={{ data: list.data, error: list.error, loading: list.loading }}
          empty={<EmptyState title="Keine Aufgaben">Aufgaben werden bei der Projektarbeit angelegt.</EmptyState>}
        >
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Beschreibung</th>
                    <th>Abrechenbar</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="muted">{t.description || "—"}</td>
                      <td>{t.default_billable ? <Tag tone="accent">abrechenbar</Tag> : <Tag tone="muted">intern</Tag>}</td>
                      <td><Tag tone={t.status === "active" ? "accent" : "muted"}>{t.status}</Tag></td>
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
