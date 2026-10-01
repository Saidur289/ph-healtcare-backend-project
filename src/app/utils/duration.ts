// Parses durations like "30s", "15m", "12h", "7d" (the format used in .env) into seconds.
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export const durationToSeconds = (value: string, fallbackSeconds: number) => {
  const match = /^\s*(\d+)\s*([smhd])\s*$/i.exec(value ?? "");
  if (!match) return fallbackSeconds;
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()];
};
