"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { AppearanceControl } from "@/lib/ui/AppearanceControl";
import { Card } from "@/lib/ui/ui";

export function AppearanceSettings(): React.ReactElement {
  return (
    <Card className="settings-appearance-card">
      <div className="settings-appearance-card__copy">
        <span className="settings-appearance-card__symbol" aria-hidden>
          <Monitor size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Darstellung</h2>
          <p>„System“ folgt automatisch deinem Gerät. Hell und Dunkel bleiben auf diesem Browser gespeichert.</p>
        </div>
      </div>
      <div className="settings-appearance-card__control">
        <span className="settings-appearance-card__examples" aria-hidden>
          <Sun size={15} />
          <Moon size={15} />
        </span>
        <AppearanceControl variant="full" />
      </div>
    </Card>
  );
}
