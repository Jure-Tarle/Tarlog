"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    console.error("Tarlog route failed", error);
  }, [error]);

  return (
    <section className="route-error" role="alert">
      <span className="route-error-symbol" aria-hidden>
        <TriangleAlert size={24} />
      </span>
      <div>
        <h1>Dieser Bereich konnte nicht geladen werden</h1>
        <p>
          Deine Daten wurden nicht verändert. Prüfe die Verbindung und versuche es erneut.
          {error.digest ? ` Fehler-ID: ${error.digest}` : ""}
        </p>
        <button type="button" className="ui-button variant-primary" onClick={reset}>
          <RefreshCw size={15} aria-hidden />
          Erneut versuchen
        </button>
      </div>
    </section>
  );
}
