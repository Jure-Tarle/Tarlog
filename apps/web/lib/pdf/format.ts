/**
 * lib/pdf/format.ts, reine Formatierungs-Helfer für PDF/CSV/Report-Ausgaben.
 *
 * Alle Funktionen sind pure (kein I/O, kein Date.now()), damit die
 * Dokumentdefinitionen ohne Server testbar bleiben (doc 10 §6.4). Geld kommt als
 * Integer-Cents rein (doc 10 "Bewusste Entscheidungen"), Dauern als ganze
 * Sekunden, Zeitpunkte als epoch-ms UTC + IANA-Zeitzone (doc 05 §8).
 *
 * Zeitzonen werden über die eingebaute `Intl.DateTimeFormat`-API aufgelöst
 * (kein Extra-Font/Extra-Paket nötig, IANA-korrekt inkl. DST).
 */
import type { CurrencyCode, EpochMs, IanaTimezone, Seconds } from "@tarlog/core";

/** Geldbetrag (Integer-Cents) → lokalisierte Währungsdarstellung, z. B. "1.234,56 €". */
export function formatMoneyCents(
  cents: number,
  currency: CurrencyCode,
  locale = "de-DE",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Zahl mit fester Nachkommastelligkeit, lokalisiert (z. B. Stunden/Menge). */
export function formatNumber(value: number, locale = "de-DE", fractionDigits = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Prozentsatz aus numeric-Wert (z. B. 19) → "19 %". */
export function formatPercent(rate: number, locale = "de-DE"): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)} %`;
}

/** Ganze Sekunden → "HH:MM" (Abrechnungs-/Nettozeit im Nachweis, doc 10 §6.2). */
export function formatDurationHm(seconds: Seconds): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Sekunden → Dezimalstunden (z. B. 4500 → 1.25), gerundet auf 2 Stellen. */
export function secondsToHours(seconds: Seconds): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

/** Lokale Kalender-/Uhrzeit-Bestandteile eines UTC-Instants in einer IANA-Zone. */
function localParts(
  at: EpochMs,
  timezone: IanaTimezone,
): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // Manche Runtimes liefern "24" für Mitternacht, normalisieren.
  const hourRaw = pick("hour");
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour, minute: pick("minute") };
}

/** epoch-ms + Zeitzone → lokales "HH:mm" (Start-/Endzeit, doc 10 §6.2 Nr. 20/21). */
export function formatLocalClock(at: EpochMs, timezone: IanaTimezone): string {
  const p = localParts(at, timezone);
  return `${p.hour}:${p.minute}`;
}

/** epoch-ms + Zeitzone → lokales "yyyy-MM-dd" (Datum-Spalte, doc 10 §6.2 Nr. 19). */
export function formatLocalDate(at: EpochMs, timezone: IanaTimezone): string {
  const p = localParts(at, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** epoch-ms + Zeitzone → lokales "yyyy-MM-dd HH:mm" (Erstellungsdatum, doc 10 §6.2 Nr. 8). */
export function formatLocalDateTime(at: EpochMs, timezone: IanaTimezone): string {
  const p = localParts(at, timezone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** DATE-Spaltenwert ("yyyy-MM-dd") lesbar darstellen, hier identisch (ISO bleibt). */
export function formatDateString(value: string | null | undefined): string {
  return value ?? ",";
}
