/**
 * lib/auth/schemas.ts, Zod-Eingabeschemas für die Auth-/Geräte-/Token-Routen.
 *
 * Auth-Inputs sind NICHT im @tarlog/core-Schemapaket (das deckt fachliche Kern-
 * entitäten ab), daher hier lokal. Feld-Konventionen wie im Rest des Projekts:
 * Zeiten epoch-ms, IDs UUID, Geld hier nicht relevant.
 */
import { z } from "zod";

/** Passwort-Policy (doc 09 §5 Nr. 3, Mindestlänge). */
const password = z.string().min(10, "Passwort muss mindestens 10 Zeichen haben.").max(1024);

/** Erststart: den EINEN main_account + Setup-Gerät anlegen (doc 05 §9.3). */
export const SetupSchema = z
  .object({
    display_name: z.string().min(1).max(200),
    email: z.string().email().max(320).optional(),
    company_name: z.string().max(200).optional(),
    password: password,
    password_confirm: z.string().optional(),
    default_currency: z.string().length(3).toUpperCase().optional(),
    default_locale: z.string().min(2).max(35).optional(),
    default_timezone: z.string().min(1).max(64).optional(),
    device_name: z.string().min(1).max(120).optional(),
  })
  .refine(
    (v) => v.password_confirm === undefined || v.password_confirm === v.password,
    { message: "Passwörter stimmen nicht überein.", path: ["password_confirm"] },
  );
export type SetupInput = z.infer<typeof SetupSchema>;

/** Login am eigenen Server (doc 05 §5.1). E-Mail optional (Single-Account). */
export const LoginSchema = z.object({
  email: z.string().email().max(320).optional(),
  password: z.string().min(1).max(1024),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** Pairing-Code erzeugen (authentifiziert). */
export const PairingCreateSchema = z.object({
  device_name: z.string().min(1).max(120).optional(),
  ttl_seconds: z.number().int().min(60).max(3600).optional(),
});
export type PairingCreateInput = z.infer<typeof PairingCreateSchema>;

/** Gerät verbindet sich mit Pairing-Code (öffentlich, code-gesichert). */
export const DeviceConnectSchema = z.object({
  code: z.string().min(1).max(32),
  device_name: z.string().min(1).max(120),
  platform: z.enum(["macos", "windows", "web", "ios"]),
  app_version: z.string().min(1).max(40),
  local_db_version: z.number().int().nonnegative().max(1_000_000).optional(),
});
export type DeviceConnectInput = z.infer<typeof DeviceConnectSchema>;

/** API-Token erstellen (authentifiziert). Klartext nur einmalig in Antwort. */
export const TokenCreateSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(60)).min(1).max(32).optional(),
  expires_at: z.number().int().positive().optional(),
  device_id: z.string().uuid().optional(),
});
export type TokenCreateInput = z.infer<typeof TokenCreateSchema>;
