import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "ptl_session",
  sessionCookieAttributes: (maxAgeMs: number) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  }),
}));

import {
  BROWSER_DEVICE_COOKIE,
  browserDeviceCookieAttributes,
  clearSessionCookie,
  getBrowserDeviceId,
  parseBrowserDeviceId,
  setBrowserDeviceCookie,
} from "./cookies";

const SESSION_COOKIE = "ptl_session";

const DEVICE_ID = "019f5a31-3f55-78e1-8f8a-a0c65d6275f1";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Browser-Geräte-Cookie", () => {
  it("akzeptiert nur UUIDs und normalisiert die Geräte-ID", () => {
    expect(parseBrowserDeviceId(DEVICE_ID.toUpperCase())).toBe(DEVICE_ID);
    expect(parseBrowserDeviceId("not-a-device")).toBeNull();
    expect(parseBrowserDeviceId(undefined)).toBeNull();

    const request = new NextRequest("http://localhost/login", {
      headers: { cookie: `${BROWSER_DEVICE_COOKIE}=${DEVICE_ID}` },
    });
    expect(getBrowserDeviceId(request)).toBe(DEVICE_ID);
  });

  it("setzt HttpOnly/SameSite und Secure nur in Produktion", () => {
    expect(browserDeviceCookieAttributes()).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(browserDeviceCookieAttributes().secure).toBe(true);
  });

  it("behält die Gerätebindung beim Löschen der Session bei", () => {
    const response = NextResponse.json({ ok: true });
    setBrowserDeviceCookie(response, DEVICE_ID);
    clearSessionCookie(response);

    expect(response.cookies.get(BROWSER_DEVICE_COOKIE)?.value).toBe(DEVICE_ID);
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
});
