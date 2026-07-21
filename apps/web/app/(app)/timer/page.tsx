/**
 * /timer, Live-Erfassung (doc 11 §2 Nr. 2, doc 03).
 * Server-Component lädt Timer-Zustand + Stammdaten und übergibt sie an die
 * Client-Konsole. Live-Refresh über den Sync-Kanal (timer.* Events).
 */
import { PageHeader, LoadError } from "@/lib/ui/ui";
import { RealtimeRefresher } from "@/lib/ui/RealtimeRefresher";
import {
  requireAccount,
  getTimer,
  listProjects,
  listTasks,
  listRoundingRules,
} from "@/lib/ui/queries";
import { TimerConsole } from "./TimerConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TimerPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let content: React.ReactElement;
  try {
    const [timer, projects, tasks, rules] = await Promise.all([
      getTimer(account.id),
      listProjects(account.id),
      listTasks(account.id),
      listRoundingRules(account.id),
    ]);
    content = (
      <TimerConsole
        initialTimer={timer}
        projects={projects}
        tasks={tasks}
        rules={rules}
        currency={account.currency}
      />
    );
  } catch {
    content = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Timer"
        subtitle="Starten, pausieren, fortsetzen, stoppen, Beschreibung wird je Projekt beim Stoppen verlangt."
        actions={<RealtimeRefresher types={["timer.", "time_entry."]} showIndicator />}
      />
      {content}
    </section>
  );
}
