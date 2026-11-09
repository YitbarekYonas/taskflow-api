import { describe, expect, it } from "vitest";
import { isPastDate, todayUtc } from "../../../src/services/dates.js";

describe("isPastDate", () => {
  it.each([
    ["the day before", "2026-11-08", "2026-11-09", true],
    ["the same day (today is not the past)", "2026-11-09", "2026-11-09", false],
    ["the day after", "2026-11-10", "2026-11-09", false],
    ["across a month boundary", "2026-10-31", "2026-11-01", true],
    ["across a year boundary", "2026-12-31", "2027-01-01", true],
    ["a single-digit day against a double-digit day", "2026-02-09", "2026-02-10", true],
  ])("%s", (_name, date, today, expected) => {
    expect(isPastDate(date, today)).toBe(expected);
  });
});

describe("todayUtc", () => {
  it("uses the UTC calendar day", () => {
    expect(todayUtc(new Date("2026-11-09T23:59:59Z"))).toBe("2026-11-09");
    expect(todayUtc(new Date("2026-11-10T00:00:00Z"))).toBe("2026-11-10");
  });

  it("is not moved by the time zone of the machine", () => {
    // 01:30 on Nov 10 in Nairobi (UTC+3) is still Nov 9 in UTC
    expect(todayUtc(new Date("2026-11-10T01:30:00+03:00"))).toBe("2026-11-09");
  });
});