import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCountdownParts, getNextBroadcastTime } from "../src/broadcast-schedule.mjs";

describe("broadcast schedule", () => {
  it("targets the next Thursday 1PM Pacific from a mid-week instant", () => {
    // Wednesday 2026-06-10 12:00 PDT (UTC-7).
    const next = getNextBroadcastTime(new Date("2026-06-10T19:00:00Z"));
    assert.equal(next.toISOString(), "2026-06-11T20:00:00.000Z");
  });

  it("keeps the same Thursday while the show has not started yet", () => {
    // Thursday 2026-06-11 12:59 PDT.
    const next = getNextBroadcastTime(new Date("2026-06-11T19:59:00Z"));
    assert.equal(next.toISOString(), "2026-06-11T20:00:00.000Z");
  });

  it("rolls to the following week once Thursday 1PM has passed", () => {
    // Thursday 2026-06-11 13:00 PDT exactly.
    const atStart = getNextBroadcastTime(new Date("2026-06-11T20:00:00Z"));
    assert.equal(atStart.toISOString(), "2026-06-18T20:00:00.000Z");

    // Thursday 2026-06-11 18:30 PDT.
    const evening = getNextBroadcastTime(new Date("2026-06-12T01:30:00Z"));
    assert.equal(evening.toISOString(), "2026-06-18T20:00:00.000Z");
  });

  it("uses the standard-time offset in winter", () => {
    // Monday 2026-01-05 09:00 PST (UTC-8) -> Thursday 2026-01-08 13:00 PST.
    const next = getNextBroadcastTime(new Date("2026-01-05T17:00:00Z"));
    assert.equal(next.toISOString(), "2026-01-08T21:00:00.000Z");
  });

  it("lands on wall-clock 1PM across the spring DST switch", () => {
    // Friday 2026-03-06 10:00 PST; DST starts Sunday 2026-03-08, so the next
    // Thursday 2026-03-12 13:00 is PDT (UTC-7).
    const next = getNextBroadcastTime(new Date("2026-03-06T18:00:00Z"));
    assert.equal(next.toISOString(), "2026-03-12T20:00:00.000Z");
  });

  it("splits the remaining time into countdown parts", () => {
    const target = new Date("2026-06-11T20:00:00Z");
    const now = new Date(target.getTime() - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);

    assert.deepEqual(getCountdownParts(target, now), {
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      totalMs: ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000,
    });
  });

  it("clamps a past target to zero", () => {
    const target = new Date("2026-06-11T20:00:00Z");

    assert.deepEqual(getCountdownParts(target, new Date("2026-06-11T20:00:01Z")), {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMs: 0,
    });
  });
});
