import { describe, expect, it } from "vitest";
import {
  isBeforeToday,
  numberOfDays,
  parseBookingDate,
  rangesOverlap,
} from "../../src/modules/bookings/booking-dates.js";

describe("booking dates", () => {
  it("parses calendar dates and rejects impossible days", () => {
    expect(parseBookingDate("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parseBookingDate("2026-02-31")).toBeNull();
    expect(parseBookingDate("01-10-2026")).toBeNull();
  });

  it("counts whole days between a start and an exclusive end", () => {
    const start = parseBookingDate("2026-10-01");
    const end = parseBookingDate("2026-10-05");
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    if (!start || !end) {
      return;
    }
    expect(numberOfDays(start, end)).toBe(4);
  });

  it("treats touching ranges as a handoff and overlapping ranges as a conflict", () => {
    const firstStart = parseBookingDate("2026-10-01");
    const firstEnd = parseBookingDate("2026-10-05");
    const overlapStart = parseBookingDate("2026-10-03");
    const overlapEnd = parseBookingDate("2026-10-07");
    const nextStart = parseBookingDate("2026-10-05");
    const nextEnd = parseBookingDate("2026-10-08");
    if (!firstStart || !firstEnd || !overlapStart || !overlapEnd || !nextStart || !nextEnd) {
      throw new Error("dates");
    }
    expect(rangesOverlap(firstStart, firstEnd, overlapStart, overlapEnd)).toBe(true);
    expect(rangesOverlap(firstStart, firstEnd, nextStart, nextEnd)).toBe(false);
  });

  it("rejects a start date before today", () => {
    const past = parseBookingDate("2020-01-01");
    const future = parseBookingDate("2026-10-01");
    expect(past).not.toBeNull();
    expect(future).not.toBeNull();
    if (!past || !future) {
      return;
    }
    expect(isBeforeToday(past, new Date("2026-09-27T12:00:00.000Z"))).toBe(true);
    expect(isBeforeToday(future, new Date("2026-09-27T12:00:00.000Z"))).toBe(false);
  });
});
