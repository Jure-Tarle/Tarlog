/**
 * lib/ui/format.ts — reine Formatierungs-Helfer (doc 11 §1: tabulare Ziffern,
 * HH:MM:SS, Integer-Cents). Isomorph (Server + Client), keine I/O, keine
 * Fremd-Deps — nur `Intl`. Zeiten sind epoch-ms UTC + IANA-Zeitzone, Geld
 * Integer-Cents. Anzeige wird auf Minuten gerundet, der interne Wert bleibt
 * sekundengenau (doc 03 §2 Nr. 34/35).
 */

/** CSS-Klassen zusammenfügen (falsy verwerfen). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const DEFAULT_LOCALE = "de-DE";
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_TZ = "Europe/Berlin";

/** Sekunden → `HH:MM:SS` (tabular). Negative werden geklammert auf 0. */
export function secondsToHMS(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Sekunden → `H:MM` (Anzeige auf Minuten gerundet, doc 03 §2 Nr. 35). */
export function secondsToHM(total: number): string {
  const mins = Math.round(Math.max(0, total) / 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

/** Sekunden → Dezimalstunden als String, z. B. `7.50`. */
export function secondsToDecimalHours(total: number, digits = 2): string {
  return (Math.max(0, total) / 3600).toFixed(digits);
}

/** Integer-Cents → lokalisierter Währungsbetrag (doc 05 §8: Geld = Cents). */
export function formatMoney(
  cents: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: (currency || DEFAULT_CURRENCY).toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function parts(
  at: number,
  tz: string,
  opts: Intl.DateTimeFormatOptions,
  locale: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: tz || DEFAULT_TZ, ...opts }).format(
      new Date(at),
    );
  } catch {
    return new Intl.DateTimeFormat(locale, opts).format(new Date(at));
  }
}

/** epoch-ms → `YYYY-MM-DD` in der Eintrags-Zeitzone (Kalendertag, doc 07). */
export function toLocalDate(at: number, tz: string = DEFAULT_TZ): string {
  // en-CA liefert ISO-Datum stabil unabhängig vom Locale.
  return parts(at, tz, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
}

/** epoch-ms → lokalisiertes Datum, z. B. `Mo., 08.07.2026`. */
export function formatDate(
  at: number | null | undefined,
  tz: string = DEFAULT_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  if (at == null) return "—";
  return parts(
    at,
    tz,
    { weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" },
    locale,
  );
}

/** epoch-ms → `HH:MM` in der Zeitzone. */
export function formatTime(
  at: number | null | undefined,
  tz: string = DEFAULT_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  if (at == null) return "—";
  return parts(at, tz, { hour: "2-digit", minute: "2-digit", hour12: false }, locale);
}

/** epoch-ms → Datum + Uhrzeit. */
export function formatDateTime(
  at: number | null | undefined,
  tz: string = DEFAULT_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  if (at == null) return "—";
  return `${formatDate(at, tz, locale)} ${formatTime(at, tz, locale)}`;
}

/** Relative Angabe „vor 3 Min." / „gerade eben" für Sync-/Aktivitätszeiten. */
export function formatRelative(
  at: number | null | undefined,
  locale: string = DEFAULT_LOCALE,
  now: number = Date.now(),
): string {
  if (at == null) return "nie";
  const diff = at - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  for (const [unit, ms] of table) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "gerade eben";
}

/**
 * epoch-ms → Wert für ein `<input type="datetime-local">` in Browser-Zeitzone.
 * Nur clientseitig sinnvoll (nutzt die lokale Zeit des Geräts).
 */
export function toDatetimeLocalValue(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** IANA-Zeitzone des laufenden Geräts (Client). */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** ISO-Kalenderwoche (1–53) eines epoch-ms (UTC-basiert, ausreichend für Anzeige). */
export function isoWeek(at: number): number {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return week;
}
