import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/version", () => ({ APP_VERSION: "test-version" }));

import { resolveActiveWebDevice } from "./setup";

const ACCOUNT_ID = "019f5a31-1111-7777-8f8a-a0c65d6275f1";
const DEVICE_ID = "019f5a31-2222-7777-8f8a-a0c65d6275f1";
const NEW_DEVICE_ID = "019f5a31-3333-7777-8f8a-a0c65d6275f1";
const PROFILE_ID = "019f5a31-4444-7777-8f8a-a0c65d6275f1";

interface QueryCall {
  sql: string;
  values: unknown[] | undefined;
}

function fakeClient(
  rowsForSelect: Array<{ id: string }>,
): { client: PoolClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows: sql.includes("SELECT id") ? rowsForSelect : [] };
  });
  return { client: { query } as unknown as PoolClient, calls };
}

describe("browserindividuelles Web-Gerät", () => {
  it("verwendet nur das aktive Cookie-Gerät desselben Accounts wieder", async () => {
    const { client, calls } = fakeClient([{ id: DEVICE_ID }]);

    const id = await resolveActiveWebDevice(
      client,
      ACCOUNT_ID,
      DEVICE_ID,
      { now: 1234 },
    );

    expect(id).toBe(DEVICE_ID);
    const lookup = calls.find((call) => call.sql.includes("SELECT id"));
    expect(lookup?.values).toEqual([DEVICE_ID, ACCOUNT_ID]);
    expect(lookup?.sql).toContain("platform = 'web'");
    expect(lookup?.sql).toContain("revoked IS NOT TRUE");
    expect(lookup?.sql).toContain("deleted_at IS NULL");
    expect(calls.some((call) => call.sql.includes("INSERT INTO devices"))).toBe(false);
  });

  it("legt ohne gültigen Cookie-Treffer Gerät und Local Profile neu an", async () => {
    const { client, calls } = fakeClient([]);
    const ids = [NEW_DEVICE_ID, PROFILE_ID];

    const id = await resolveActiveWebDevice(
      client,
      ACCOUNT_ID,
      DEVICE_ID,
      { now: 5678, createId: () => ids.shift()! },
    );

    expect(id).toBe(NEW_DEVICE_ID);
    const deviceInsert = calls.find((call) => call.sql.includes("INSERT INTO devices"));
    const profileInsert = calls.find((call) => call.sql.includes("INSERT INTO local_profiles"));
    expect(deviceInsert?.values).toEqual([NEW_DEVICE_ID, ACCOUNT_ID, expect.any(String), 5678]);
    expect(profileInsert?.values).toEqual([PROFILE_ID, ACCOUNT_ID, NEW_DEVICE_ID, 5678]);
  });
});
