import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use dynamic import to get a fresh module per test
describe('checkRateLimit', () => {
  let checkRateLimit: (ip: string) => { allowed: boolean; retryAfterMs?: number }

  beforeEach(async () => {
    vi.resetModules()
    // Fake timers to control setInterval cleanup
    vi.useFakeTimers()
    const mod = await import('../agent/rate-limit')
    checkRateLimit = mod.checkRateLimit
  })

  it('allows first request', () => {
    const result = checkRateLimit('192.168.1.1')
    expect(result.allowed).toBe(true)
  })

  it('allows up to 20 requests per window', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit('10.0.0.1').allowed).toBe(true)
    }
  })

  it('blocks the 21st request', () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit('10.0.0.2')
    }
    const result = checkRateLimit('10.0.0.2')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks IPs independently', () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit('10.0.0.3')
    }
    // Different IP should still be allowed
    expect(checkRateLimit('10.0.0.4').allowed).toBe(true)
  })

  it('resets after window expires', () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit('10.0.0.5')
    }
    expect(checkRateLimit('10.0.0.5').allowed).toBe(false)

    // Advance past the 60s window
    vi.advanceTimersByTime(61_000)

    expect(checkRateLimit('10.0.0.5').allowed).toBe(true)
  })

  it('retryAfterMs decreases as time passes', () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit('10.0.0.6')
    }
    const first = checkRateLimit('10.0.0.6')

    vi.advanceTimersByTime(30_000) // halfway through window

    const second = checkRateLimit('10.0.0.6')
    expect(second.allowed).toBe(false)
    expect(second.retryAfterMs!).toBeLessThan(first.retryAfterMs!)
  })
})
