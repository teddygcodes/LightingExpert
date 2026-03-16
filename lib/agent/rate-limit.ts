// lib/agent/rate-limit.ts
// Simple in-memory sliding-window rate limiter: 30 requests/minute per IP.
// Resets on server restart — acceptable for v1.5 single-user.

const WINDOW_MS = 60_000  // 1 minute
const MAX_REQUESTS = 30

const store = new Map<string, number[]>()

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const timestamps = (store.get(ip) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0]
    return { allowed: false, retryAfterMs: oldest + WINDOW_MS - now }
  }

  timestamps.push(now)
  store.set(ip, timestamps)

  // Periodic cleanup: evict keys with no recent requests (~1% of calls)
  if (Math.random() < 0.01) {
    for (const [key, ts] of store.entries()) {
      if (ts.every((t) => t <= windowStart)) store.delete(key)
    }
  }

  return { allowed: true }
}
