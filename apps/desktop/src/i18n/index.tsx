/**
 * i18n, minimal runtime translation layer. German is the source language and
 * doubles as the dictionary key: `t("Neues Projekt")` returns the key itself
 * in German mode and the English dictionary entry (src/i18n/en/*) in English
 * mode. Unknown keys fall back to German, so a missing entry never breaks the
 * UI. `{name}` placeholders are interpolated after lookup.
 *
 * The chosen language persists as the account setting `ui.language`; the Rust
 * shell reads the same row at startup for the native menu and tray.
 */
import { createContext, useContext, useEffect, useState, Fragment, type ReactNode } from "react";
import { getSetting, setSetting } from "../data/settings";
import { en } from "./en";

export type Language = "de" | "en";

export const LANGUAGE_SETTING_KEY = "ui.language";

/** Module-level current language so non-React code (data layer) can translate. */
let current: Language = "de";

export function getLanguage(): Language {
  return current;
}

/** BCP-47 locale for number/date formatting matching the UI language. */
export function getLocale(): string {
  return current === "en" ? "en-US" : "de-DE";
}

/** Translate a German source string; `{name}` params are interpolated. */
export function t(text: string, params?: Record<string, string | number>): string {
  let out = current === "en" ? (en[text] ?? text) : text;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.replaceAll(`{${key}}`, String(value));
    }
  }
  return out;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue>({
  language: "de",
  setLanguage: async () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("de");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSetting<Language>(LANGUAGE_SETTING_KEY)
      .then((stored) => {
        if (stored === "en" || stored === "de") {
          current = stored;
          setLanguageState(stored);
        }
      })
      .catch(() => {
        // Ohne lesbare Einstellung startet die UI auf Deutsch.
      })
      .finally(() => setReady(true));
  }, []);

  async function setLanguage(lang: Language) {
    current = lang;
    setLanguageState(lang);
    await setSetting(LANGUAGE_SETTING_KEY, lang);
  }

  // Blank until the stored language is known, to avoid a visible flash from
  // German to English on startup.
  if (!ready) return null;

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {/* key remounts the tree on switch so module-level t() calls re-render */}
      <Fragment key={language}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
