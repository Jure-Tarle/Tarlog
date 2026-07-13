import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { assertSameOrigin, requiredBearerScope } from "./api";

describe("REST Bearer-Scopes", () => {
  it("leitet den Scope aus dem ersten API-Segment ab", () => {
    expect(requiredBearerScope("/api/sync/events", "POST")).toBe("sync");
    expect(requiredBearerScope("/api/timer/start", "POST")).toBe("timer");
    expect(requiredBearerScope("/api/time-entries/entry-1", "PATCH")).toBe("time_entries");
    expect(requiredBearerScope("/api/devices", "GET")).toBe("devices_read");
    expect(requiredBearerScope("/api/devices/device-1", "DELETE")).toBe("devices");
    expect(requiredBearerScope("/dashboard")).toBeNull();
  });
});

describe("Session-CSRF-Origin", () => {
  it("akzeptiert denselben Host", () => {
    const request = new NextRequest("https://tarlog.example/api/customers", {
      method: "POST",
      headers: { origin: "https://tarlog.example" },
    });
    expect(() => assertSameOrigin(request, { requireOrigin: true })).not.toThrow();
  });

  it("weist fremde oder fehlende Origins für Browser-Mutationen ab", () => {
    const foreign = new NextRequest("https://tarlog.example/api/customers", {
      method: "POST",
      headers: { origin: "https://admin.tarlog.example" },
    });
    const missing = new NextRequest("https://tarlog.example/api/customers", {
      method: "POST",
    });
    expect(() => assertSameOrigin(foreign, { requireOrigin: true })).toThrow(
      "Origin nicht erlaubt",
    );
    expect(() => assertSameOrigin(missing, { requireOrigin: true })).toThrow(
      "Origin für Browser-Anfrage erforderlich",
    );
  });

  it("erlaubt fehlenden Origin nur im expliziten Nicht-Browser-Modus", () => {
    const request = new NextRequest("https://tarlog.example/api/auth/login", {
      method: "POST",
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });
});
