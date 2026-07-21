/**
 * Aufgaben, Bereich 8 (doc 06 A.2 `tasks`). Liste der Tätigkeitsarten
 * (global oder projektbezogen) über die lokale data-Schicht.
 */
import { Page, Card, AsyncBody, EmptyState, TableWrap, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { listTasks } from "../data/tasks";
import { t } from "../i18n";

export default function Tasks() {
  const list = useAsync(() => listTasks(null), []);

  return (
    <Page title={t("Aufgaben")} hint={t("Tätigkeitsarten, global oder projektbezogen")}>
      <Card title={t("Aufgaben")} subtitle={t("{n} Einträge", { n: list.data?.length ?? 0 })}>
        <AsyncBody
          state={{ data: list.data, error: list.error, loading: list.loading }}
          empty={<EmptyState title={t("Keine Aufgaben")}>{t("Aufgaben werden bei der Projektarbeit angelegt.")}</EmptyState>}
        >
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("Name")}</th>
                    <th>{t("Beschreibung")}</th>
                    <th>{t("Abrechenbar")}</th>
                    <th>{t("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t2) => (
                    <tr key={t2.id}>
                      <td>{t2.name}</td>
                      <td className="muted">{t2.description || ","}</td>
                      <td>{t2.default_billable ? <Tag tone="accent">{t("abrechenbar")}</Tag> : <Tag tone="muted">{t("intern")}</Tag>}</td>
                      <td><Tag tone={t2.status === "active" ? "accent" : "muted"}>{t2.status}</Tag></td>
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
