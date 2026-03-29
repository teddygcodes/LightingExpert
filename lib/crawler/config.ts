/**
 * Centralized crawler configuration.
 * All timeout, concurrency, and budget values in one place.
 */

export interface CrawlerConfig {
  concurrency: number
  pageTimeoutMs: number
  selectorTimeoutMs: number
  pdfDownloadTimeoutMs: number
  imageDownloadTimeoutMs: number
  downloadRetries: number
  retryBaseDelayMs: number
}

export const CRAWLER_DEFAULTS: CrawlerConfig = {
  concurrency: 3,
  pageTimeoutMs: 45_000,
  selectorTimeoutMs: 15_000,
  pdfDownloadTimeoutMs: 20_000,
  imageDownloadTimeoutMs: 10_000,
  downloadRetries: 2,
  retryBaseDelayMs: 500,
}

/** Per-manufacturer overrides (merged over CRAWLER_DEFAULTS) */
export const CRAWLER_OVERRIDES: Record<string, Partial<CrawlerConfig>> = {
  elite: { concurrency: 5, pageTimeoutMs: 30_000 },
  acuity: {},
  'acuity-cs': {},
  cooper: {},
  current: {},
  lutron: { concurrency: 5 },
}

export function getCrawlerConfig(manufacturer: string): CrawlerConfig {
  return { ...CRAWLER_DEFAULTS, ...CRAWLER_OVERRIDES[manufacturer] }
}

// ─── AI Budget ───────────────────────────────────────────────────────────────

export const AI_BUDGET_DEFAULTS = {
  maxAiCallsPerCrawl: 50,
}

export class AiBudget {
  private used = 0
  private readonly max: number

  constructor(maxCalls = AI_BUDGET_DEFAULTS.maxAiCallsPerCrawl) {
    this.max = maxCalls
  }

  /** Returns true if an AI call can be made (budget not exhausted). */
  canCall(): boolean {
    return this.used < this.max
  }

  /** Record an AI call. */
  record(): void {
    this.used++
    if (this.used === this.max) {
      console.warn(`[AI Budget] Exhausted (${this.max} calls used). Remaining products will use regex-only extraction.`)
    }
  }

  get remaining(): number {
    return Math.max(0, this.max - this.used)
  }

  get totalUsed(): number {
    return this.used
  }
}
