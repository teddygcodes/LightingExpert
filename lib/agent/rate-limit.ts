// lib/agent/rate-limit.ts
// In-memory rate limiter: 20 requests per IP per minute.

const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

interface Entry {
  count: number
  windowStart: number
}

const store = new Map<string, Entry>()

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now })
    return { allowed: true }
  }

  if (entry.count < MAX_REQUESTS) {
    entry.count++
    return { allowed: true }
  }

  const retryAfterMs = WINDOW_MS - (now - entry.windowStart)
  return { allowed: false, retryAfterMs }
}
