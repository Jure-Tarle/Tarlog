import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { resolveAppVersion } from "./version";

describe("resolveAppVersion", () => {
  it("uses the package manifest by default", () => {
    expect(resolveAppVersion(undefined)).toBe(packageJson.version);
  });

  it("accepts a deployment override", () => {
    expect(resolveAppVersion("1.2.3")).toBe("1.2.3");
  });

  it("ignores an empty deployment override", () => {
    expect(resolveAppVersion("  ")).toBe(packageJson.version);
  });
});
