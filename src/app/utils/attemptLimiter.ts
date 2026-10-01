// Small in-memory counters for login lockout and OTP resend cooldowns.
// NOTE: memory is per server process. With more than one instance, move this to Redis (plan.md 9.2).

type Entry = { count: number; firstAt: number; lockedUntil?: number };

export const createAttemptLimiter = (options: {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
}) => {
  const entries = new Map<string, Entry>();

  const cleanup = (key: string, now: number) => {
    const entry = entries.get(key);
    if (!entry) return;
    const lockOver = !entry.lockedUntil || entry.lockedUntil <= now;
    const windowOver = now - entry.firstAt > options.windowMs;
    if (lockOver && windowOver) entries.delete(key);
  };

  return {
    // milliseconds until the key is unlocked (0 = not locked)
    lockedFor(key: string) {
      const now = Date.now();
      cleanup(key, now);
      const lockedUntil = entries.get(key)?.lockedUntil ?? 0;
      return lockedUntil > now ? lockedUntil - now : 0;
    },
    // record a failure; returns true when this failure locked the key
    fail(key: string) {
      const now = Date.now();
      cleanup(key, now);
      const entry = entries.get(key) ?? { count: 0, firstAt: now };
      entry.count += 1;
      if (entry.count >= options.maxAttempts) {
        entry.lockedUntil = now + options.lockMs;
        entry.count = 0;
        entry.firstAt = now;
        entries.set(key, entry);
        return true;
      }
      entries.set(key, entry);
      return false;
    },
    reset(key: string) {
      entries.delete(key);
    },
  };
};

// 5 wrong passwords within 15 minutes -> locked for 15 minutes
export const loginLimiter = createAttemptLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
});

// at most one OTP email per address per 60 seconds
export const otpResendLimiter = createAttemptLimiter({
  maxAttempts: 1,
  windowMs: 60 * 1000,
  lockMs: 60 * 1000,
});
