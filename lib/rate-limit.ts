type LimitResult = { allowed: boolean; retryAfter?: number };

function createRateLimiter(windowMs: number, maxAttempts: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  // Periodically prune stale entries so the Map doesn't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
  }, windowMs);

  return function check(key: string): LimitResult {
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    if (entry.count >= maxAttempts) {
      return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count++;
    return { allowed: true };
  };
}

export const checkLoginRateLimit = createRateLimiter(15 * 60 * 1000, 10);

// Stricter and longer-windowed than login: each hit sends an email, so this
// also bounds how many reset emails a single IP can trigger.
export const checkPasswordResetRateLimit = createRateLimiter(60 * 60 * 1000, 5);
