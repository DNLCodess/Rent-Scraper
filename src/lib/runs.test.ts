import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, useTestDb } from "./db";
import { MockScraper } from "./scraper/mock";
import { ScraperError, type Scraper } from "./scraper/types";

const scraperRef: { current: Scraper | null } = { current: null };
vi.mock("./settings", async (orig) => ({
  ...(await orig<typeof import("./settings")>()),
  getScraper: async () => scraperRef.current!,
}));

// Route handlers call connection(), which only works inside a real request.
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
}));

const { advanceRun, createRun } = await import("./runs");

beforeEach(async () => {
  await useTestDb();
  scraperRef.current = new MockScraper();
});

const jobsOf = async (id: string) =>
  JSON.parse(String((await (await db()).execute({ sql: "SELECT jobs FROM runs WHERE id = ?", args: [id] })).rows[0].jobs));

describe("createRun partial start failure", () => {
  it("keeps the jobs that started, notes the error and stays running", async () => {
    const mock = new MockScraper();
    let calls = 0;
    scraperRef.current = {
      ...mock,
      status: mock.status.bind(mock),
      items: mock.items.bind(mock),
      start: async (term, count) => {
        calls++;
        if (calls === 2) throw new ScraperError("PROVIDER", "Apify said no");
        return mock.start(term, count);
      },
    };
    const run = await createRun(["a", "b"], 3);
    expect(run.status).toBe("running");
    expect(run.error).toContain("Apify said no");
    const jobs = await jobsOf(run.id);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ status: "running", ingested: false });
    expect(jobs[0].jobId).toMatch(/^mock:/);
    expect(jobs[1]).toMatchObject({ status: "failed" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 20_000));
    const done = await advanceRun(run.id);
    vi.useRealTimers();
    expect(done?.status).toBe("done");
    expect(done?.result_count).toBeGreaterThan(0);
    expect(done?.error).toContain("#b");
  });

  it("fails the run when no job started", async () => {
    scraperRef.current = {
      start: async () => {
        throw new ScraperError("QUOTA", "Out of credit");
      },
      status: async () => ({ status: "running", itemCount: 0 }),
      items: async () => [],
    };
    const run = await createRun(["a", "b"], 3);
    expect(run).toMatchObject({ status: "failed", error_code: "QUOTA" });
  });
});

describe("GET /api/runs catch-up", () => {
  it("advances a few runs stuck running for over two minutes, not fresh ones", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
    const stale = await createRun(["a"], 3);
    vi.setSystemTime(new Date("2026-11-25T10:02:30Z"));
    const fresh = await createRun(["b"], 3);
    vi.setSystemTime(new Date("2026-11-25T10:03:00Z"));
    const { GET } = await import("@/app/api/runs/route");
    const body = await (await GET()).json();
    vi.useRealTimers();
    const byId = new Map(body.runs.map((r: { id: string; status: string }) => [r.id, r.status]));
    expect(byId.get(stale.id)).toBe("done");
    expect(byId.get(fresh.id)).toBe("running");
  });
});

describe("advanceStaleRuns time budget", () => {
  it("returns within its budget when the scraper hangs", async () => {
    const { advanceStaleRuns } = await import("./runs");
    const run = await createRun(["a"], 3);
    await (await db()).execute({
      sql: "UPDATE runs SET created_at = ? WHERE id = ?",
      args: [new Date(Date.now() - 10 * 60_000).toISOString(), run.id],
    });
    const mock = new MockScraper();
    scraperRef.current = { ...mock, start: mock.start.bind(mock), items: mock.items.bind(mock), status: () => new Promise(() => {}) };
    const t0 = Date.now();
    await advanceStaleRuns({ budgetMs: 50 });
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
