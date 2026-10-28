import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Vercel Hobby accepts cron jobs that run no more than once per day. */
describe("vercel.json cron (Vercel Hobby)", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };

  it("schedules the webhook dispatcher once a day", () => {
    const cron = config.crons?.find((entry) => entry.path === "/api/v1/webhooks/dispatch");
    expect(cron).toBeDefined();
    expect(cron!.schedule).toBe("0 0 * * *");
  });

  it("schedules the platform internal cron runner once a day", () => {
    const cron = config.crons?.find((entry) => entry.path === "/api/internal/cron");
    expect(cron).toBeDefined();
    expect(cron!.schedule).toBe("0 1 * * *");
  });
});
