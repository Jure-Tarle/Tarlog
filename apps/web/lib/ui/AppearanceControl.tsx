"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_STORAGE_KEY,
  nextAppearance,
  normalizeAppearance,
  resolveAppearance,
  type AppearancePreference,
  type ResolvedAppearance,
} from "./appearance";
import { cx } from "./format";

const OPTIONS: Array<{
  value: AppearancePreference;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
];

function readPreference(): AppearancePreference {
  const fromDom = normalizeAppearance(document.documentElement.dataset.themePreference);
  try {
    return normalizeAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? fromDom);
  } catch {
    return fromDom;
  }
}

function updateThemeColor(theme: ResolvedAppearance): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[data-tarlog-theme-color="true"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.dataset.tarlogThemeColor = "true";
    document.head.append(meta);
  }
  meta.content = theme === "dark" ? "#171719" : "#f5f5f7";
}

function applyAppearance(preference: AppearancePreference, persist: boolean): ResolvedAppearance {
  const theme = resolveAppearance(
    preference,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  updateThemeColor(theme);

  if (persist) {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
    } catch {
      // The selected appearance remains active for this browser session.
    }
  }

  return theme;
}

function useAppearance(): {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
} {
  const [preference, setPreferenceState] = useState<AppearancePreference>("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initial = readPreference();
    applyAppearance(initial, false);
    setPreferenceState(initial);

    const onSystemAppearanceChange = () => {
      const current = readPreference();
      if (current === "system") applyAppearance(current, false);
    };
    const onAppearanceChange = (event: Event) => {
      const selected = normalizeAppearance((event as CustomEvent<string>).detail);
      setPreferenceState(selected);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      const selected = normalizeAppearance(event.newValue);
      applyAppearance(selected, false);
      setPreferenceState(selected);
    };

    media.addEventListener("change", onSystemAppearanceChange);
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onAppearanceChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemAppearanceChange);
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, onAppearanceChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((selected: AppearancePreference): void => {
    const root = document.documentElement;
    root.classList.add("theme-is-changing");
    applyAppearance(selected, true);
    setPreferenceState(selected);
    window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, { detail: selected }));
    window.setTimeout(() => root.classList.remove("theme-is-changing"), 280);
  }, []);

  return { preference, setPreference };
}

export function AppearanceControl({
  variant = "full",
  className,
}: {
  variant?: "full" | "icons" | "compact";
  className?: string;
}): React.ReactElement {
  const { preference, setPreference } = useAppearance();

  if (variant === "compact") {
    const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0]!;
    const next = OPTIONS.find((option) => option.value === nextAppearance(preference)) ?? OPTIONS[0]!;
    const Icon = current.icon;
    return (
      <button
        type="button"
        className={cx("icon-button", "appearance-cycle", className)}
        onClick={() => setPreference(next.value)}
        aria-label={`Erscheinungsbild: ${current.label}. Zu ${next.label} wechseln`}
        title={`Erscheinungsbild: ${current.label}`}
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cx("appearance-control", variant === "icons" && "is-icons-only", className)}
      role="group"
      aria-label="Erscheinungsbild"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.value === preference;
        return (
          <button
            key={option.value}
            type="button"
            className="appearance-option"
            aria-pressed={selected}
            aria-label={variant === "icons" ? option.label : undefined}
            title={variant === "icons" ? option.label : undefined}
            onClick={() => setPreference(option.value)}
          >
            <Icon size={15} strokeWidth={selected ? 2.15 : 1.8} aria-hidden />
            {variant === "full" ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
