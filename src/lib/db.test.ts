import { beforeEach, describe, expect, it } from "vitest";
import { migrate, useTestDb } from "./db";

const V2_COLUMNS = [
  "status",
  "status_changed_at",
  "first_seen_at",
  "drop_reason",
  "power_level",
  "power_raw",
  "total_package_ngn",
  "inspection_at",
  "offer_ngn",
  "counter_ngn",
  "power_confirmed",
  "replied_at",
  "archived",
  "prev_status",
];

describe("schema v2", () => {
  let c: Awaited<ReturnType<typeof useTestDb>>;
  beforeEach(async () => {
    c = await useTestDb();
  });

  it("adds v2 listing columns", async () => {
    const info = await c.execute("PRAGMA table_info(listings)");
    const names = info.rows.map((r) => r.name);
    for (const col of V2_COLUMNS) expect(names).toContain(col);
    const runs = await c.execute("PRAGMA table_info(runs)");
    expect(runs.rows.map((r) => r.name)).toContain("source");
  });

  it("creates the v2 tables", async () => {
    const t = await c.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const names = t.rows.map((r) => r.name);
    for (const n of ["notes", "preferences", "blocked_authors", "saved_searches"]) {
      expect(names).toContain(n);
    }
  });

  it("is idempotent", async () => {
    await migrate(c);
    await expect(migrate(c)).resolves.toBeUndefined();
  });

  it("defaults status to new and power_level to unknown", async () => {
    await c.execute(
      `INSERT INTO listings (id, run_id, tag, url, author, caption, updated_at)
       VALUES ('1', 'r', 't', 'u', 'a', 'c', '2026-01-01T00:00:00Z')`,
    );
    const row = (await c.execute("SELECT * FROM listings WHERE id = '1'")).rows[0];
    expect(row.status).toBe("new");
    expect(row.power_level).toBe("unknown");
    expect(row.archived).toBe(0);
  });

  it("gives each useTestDb call a fresh database", async () => {
    await c.execute(
      `INSERT INTO listings (id, run_id, tag, url, author, caption, updated_at)
       VALUES ('1', 'r', 't', 'u', 'a', 'c', 'x')`,
    );
    const fresh = await useTestDb();
    const n = await fresh.execute("SELECT COUNT(*) AS n FROM listings");
    expect(n.rows[0].n).toBe(0);
  });

  it("backfills first_seen_at from updated_at", async () => {
    await c.execute(
      `INSERT INTO listings (id, run_id, tag, url, author, caption, updated_at)
       VALUES ('1', 'r', 't', 'u', 'a', 'c', '2026-01-01T00:00:00Z')`,
    );
    await migrate(c);
    const row = (await c.execute("SELECT first_seen_at FROM listings")).rows[0];
    expect(row.first_seen_at).toBe("2026-01-01T00:00:00Z");
  });
});
