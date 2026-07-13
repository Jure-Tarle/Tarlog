export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

export type NavigatorPlatformSource = Pick<Navigator, "platform" | "userAgent">;

/**
 * Tauri v2's core JS package does not expose the host OS. The optional
 * `@tauri-apps/plugin-os` would, but it is intentionally not part of Tarlog's
 * current runtime. WebKit's platform/user-agent pair is stable inside the
 * desktop WebView and keeps this presentation-only decision out of IPC.
 */
export function resolveDesktopPlatform(source: NavigatorPlatformSource): DesktopPlatform {
  const signature = `${source.platform} ${source.userAgent}`.toLowerCase();

  if (/(mac|darwin)/.test(signature)) return "macos";
  if (/(win32|win64|windows)/.test(signature)) return "windows";
  if (/(linux|x11)/.test(signature)) return "linux";
  return "unknown";
}

export function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "unknown";
  return resolveDesktopPlatform(navigator);
}
