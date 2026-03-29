/**
 * Retry utility with exponential backoff for transient failures.
 * Used by crawlers for page navigation and file downloads.
 */

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  label?: string
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 500, label = 'operation' } = opts
  let lastErr: Error | undefined

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)
        console.warn(`[Retry] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastErr!
}

/**
 * Like withRetry but returns null instead of throwing on final failure.
 * Useful for optional downloads (PDFs, images) where a missing file is acceptable.
 */
export async function withRetryOrNull<T>(
  fn: (attempt: number) => Promise<T | null>,
  opts: RetryOptions = {},
): Promise<T | null> {
  const { maxRetries = 2, baseDelayMs = 500, label = 'operation' } = opts

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn(attempt)
      if (result !== null) return result
      // null result on last attempt — don't retry
      if (attempt > maxRetries) return null
    } catch {
      if (attempt > maxRetries) return null
    }

    const delay = baseDelayMs * Math.pow(2, attempt - 1)
    if (attempt <= maxRetries) {
      console.warn(`[Retry] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  return null
}
