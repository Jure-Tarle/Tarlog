/**
 * /tasks — Aufgaben/Tätigkeitsarten (doc 11 §2 Nr. 8), global oder projektbezogen.
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { requireAccount, listTasks, listProjects } from "@/lib/ui/queries";
import { TaskForm } from "./TaskForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TasksPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  let form: React.ReactElement | null = null;
  try {
    const [tasks, projects] = await Promise.all([listTasks(account.id), listProjects(account.id)]);
    form = <TaskForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />;
    body =
      tasks.length === 0 ? (
        <EmptyState title="Noch keine Aufgaben" hint="Aufgaben strukturieren Tätigkeiten je Projekt oder global." action={form} />
      ) : (
        <Table
          head={
            <>
              <Th>Aufgabe</Th>
              <Th>Projekt</Th>
              <Th>Kostenstelle</Th>
              <Th align="center">Abrechenbar</Th>
              <Th align="center">Status</Th>
            </>
          }
        >
          {tasks.map((t) => (
            <tr key={t.id}>
              <Td><span style={{ fontWeight: 500 }}>{t.name}</span></Td>
              <Td muted>{t.projectName ?? "global"}</Td>
              <Td mono muted>{t.cost_center ?? "—"}</Td>
              <Td align="center">{t.default_billable ? <Badge tone="accent">ja</Badge> : <Badge tone="muted">nein</Badge>}</Td>
              <Td align="center"><Badge tone={t.status === "active" ? "neutral" : "muted"}>{t.status ?? "active"}</Badge></Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Aufgaben" subtitle="Tätigkeitsarten global oder projektbezogen" actions={form} />
      {body}
    </section>
  );
}
