const DAY_MS = 86_400_000;

export function parseBookingDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isBeforeToday(date: Date, now = new Date()): boolean {
  return startOfUtcDay(date) < startOfUtcDay(now);
}

export function numberOfDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
}

export function rangesOverlap(
  startDate: Date,
  endDate: Date,
  otherStart: Date,
  otherEnd: Date,
): boolean {
  return startDate < otherEnd && endDate > otherStart;
}
