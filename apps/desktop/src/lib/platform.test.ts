import { describe, expect, it } from "vitest";
import { resolveDesktopPlatform } from "./platform";

describe("resolveDesktopPlatform", () => {
  it.each([
    ["MacIntel", "Mozilla/5.0", "macos"],
    ["", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macos"],
    ["Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["", "TarlogWebView", "unknown"],
  ] as const)("maps %s to %s", (platform, userAgent, expected) => {
    expect(resolveDesktopPlatform({ platform, userAgent })).toBe(expected);
  });
});
