import { beforeEach, describe, expect, it, vi } from "vitest";
import { addColumnIfMissing, db, migrate, PARSER_VERSION, resetMigrationForTests, useTestDb } from "./db";

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

describe("migration robustness", () => {
  it("retries a failed migrate on the next db() call", async () => {
    const c = await useTestDb();
    resetMigrationForTests();
    const spy = vi.spyOn(c, "batch").mockRejectedValueOnce(new Error("network blip"));
    await expect(db()).rejects.toThrow("network blip");
    await expect(db()).resolves.toBe(c);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("ignores a duplicate column error when another instance added it first", async () => {
    const c = await useTestDb();
    // A stale (empty) column list makes it take the ALTER path for a column that exists.
    await expect(addColumnIfMissing(c, "listings", "cover_url", "TEXT", new Set())).resolves.toBeUndefined();
    await expect(addColumnIfMissing(c, "listings", "cover_url", "TEXT", new Set())).resolves.toBeUndefined();
  });

  it("still throws other ALTER errors", async () => {
    const c = await useTestDb();
    await expect(addColumnIfMissing(c, "no_such_table", "x", "TEXT", new Set())).rejects.toThrow();
  });
});

describe("legacy re-parse", () => {
  const legacy = async (c: Awaited<ReturnType<typeof useTestDb>>) => {
    await c.execute(
      `INSERT INTO listings (id, run_id, tag, url, author, caption, price_raw, price_ngn, price_period, bio,
         updated_at, status, drop_reason, first_seen_at, cover_url)
       VALUES ('L1', 'r', 't', 'u', 'a', '2 bedroom Yaba. Total package ₦1.95m. 24hrs light', '₦1.95m', 1950000,
         NULL, 'Call 08031234567', '2026-01-01T00:00:00Z', 'shortlisted', NULL, '2025-12-01T00:00:00Z', 'https://img/c.jpg')`,
    );
  };

  it("re-parses rows stored by an older parser, touching only parsed columns", async () => {
    const c = await useTestDb();
    await legacy(c);
    await c.execute("UPDATE settings SET value = '1' WHERE key = 'parser_version'");
    await migrate(c);
    const row = (await c.execute("SELECT * FROM listings WHERE id = 'L1'")).rows[0];
    expect(row.price_ngn).toBeNull();
    expect(row.total_package_ngn).toBe(1_950_000);
    expect(row.bedrooms).toBe(2);
    expect(row.phone).toBe("+2348031234567");
    expect(row.power_level).not.toBe("unknown");
    expect(row.status).toBe("shortlisted");
    expect(row.first_seen_at).toBe("2025-12-01T00:00:00Z");
    expect(row.cover_url).toBe("https://img/c.jpg");
    const v = (await c.execute("SELECT value FROM settings WHERE key = 'parser_version'")).rows[0].value;
    expect(Number(v)).toBe(PARSER_VERSION);
  });

  it("re-parses when no version is stored, and runs again harmlessly", async () => {
    const c = await useTestDb();
    await legacy(c);
    await c.execute("DELETE FROM settings WHERE key = 'parser_version'");
    await Promise.all([migrate(c), migrate(c)]);
    await migrate(c);
    const row = (await c.execute("SELECT price_ngn, total_package_ngn FROM listings WHERE id = 'L1'")).rows[0];
    expect(row).toMatchObject({ price_ngn: null, total_package_ngn: 1_950_000 });
  });

  it("skips the re-parse once the version is current", async () => {
    const c = await useTestDb();
    await legacy(c);
    await migrate(c);
    const row = (await c.execute("SELECT price_ngn FROM listings WHERE id = 'L1'")).rows[0];
    expect(row.price_ngn).toBe(1_950_000); // inserted after the version was stored: left alone
  });
});
