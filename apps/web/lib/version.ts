import packageJson from "../package.json";

/**
 * Public application version reported by health and device metadata.
 * Deployments may override it, while local and bundled builds stay aligned
 * with the web package manifest by default.
 */
export function resolveAppVersion(override: string | undefined): string {
  return override?.trim() || packageJson.version;
}

export const APP_VERSION = resolveAppVersion(process.env.NEXT_PUBLIC_APP_VERSION);
