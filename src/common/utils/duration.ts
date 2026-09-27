const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = match[1];
  const unit = match[2];
  if (!amount || !unit || !(unit in UNIT_MS)) {
    throw new Error(`Invalid duration: ${value}`);
  }
  return Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
}
