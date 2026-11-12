/**
 * In-memory safety nets for the single-user, localhost Claude route.
 * Not meant for multi-tenant production — just enough to prevent runaway
 * concurrent CLI processes and accidental request floods.
 */

const MAX_CONCURRENT = 2;
let active = 0;

export function tryAcquireSlot(): boolean {
  if (active >= MAX_CONCURRENT) return false;
  active += 1;
  return true;
}

export function releaseSlot(): void {
  active = Math.max(0, active - 1);
}

// Simple fixed-window rate limit (global, since this is a personal app).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = Date.now();
let countInWindow = 0;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(): RateLimitResult {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    countInWindow = 0;
  }
  if (countInWindow >= MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds };
  }
  countInWindow += 1;
  return { ok: true };
}
