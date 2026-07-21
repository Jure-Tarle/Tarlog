/**
 * /nachtrag, Nachtragsassistent (doc 11 §2 Nr. 12, doc 03 §7). Lädt Stammdaten
 * serverseitig und übergibt Vorbelegung (Datum/Start/Ende aus einer erkannten
 * Lücke) an das Client-Formular.
 */
import { PageHeader, LoadError, Card } from "@/lib/ui/ui";
import { formatTime } from "@/lib/ui/format";
import {
  requireAccount,
  listProjects,
  listTasks,
  listRoundingRules,
  todayIso,
} from "@/lib/ui/queries";
import { NachtragForm } from "./NachtragForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NachtragPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; start?: string; end?: string; kind?: string }>;
}): Promise<React.JSX.Element> {
  const account = await requireAccount();
  const sp = await searchParams;
  const tz = account.timezone;
  const startMs = sp.start ? Number(sp.start) : NaN;
  const endMs = sp.end ? Number(sp.end) : NaN;

  const prefill = {
    date: sp.date ?? todayIso(tz),
    startTime: Number.isFinite(startMs) ? formatTime(startMs, tz) : "09:00",
    endTime: Number.isFinite(endMs) ? formatTime(endMs, tz) : "10:00",
  };

  let body: React.JSX.Element;
  try {
    const [projects, tasks, rules] = await Promise.all([
      listProjects(account.id),
      listTasks(account.id),
      listRoundingRules(account.id),
    ]);
    body = (
      <NachtragForm
        projects={projects}
        tasks={tasks}
        rules={rules}
        currency={account.currency}
        prefill={prefill}
      />
    );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Nachtragen"
        subtitle="Vergessene Arbeitszeit erfassen, Quelle wird als „manuell nachgetragen“ markiert."
      />
      <Card>{body}</Card>
    </section>
  );
}
