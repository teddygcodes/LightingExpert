# Atlantis KB Lighting Expert

A production-grade commercial lighting specification platform built for outside sales engineers and lighting specifiers. Crawls six manufacturer catalogs, normalizes product data through a two-pass extraction pipeline (regex + Claude AI fallback), runs a rule-based cross-reference engine across manufacturers, and generates professional PDF submittal packages — all accessible through a streaming AI chat interface or direct web UI.

---

## What It Does

Commercial lighting specification involves three core workflows that this system automates:

1. **Spec a fixture** — Search across 6 manufacturers by catalog number, fixture type, wattage, lumens, CCT, CRI, voltage, DLC status, or any combination. Every extracted spec carries provenance metadata (source, confidence, raw value) so you know exactly where each number came from.

2. **Cross-reference alternatives** — Given a source fixture, the engine finds compatible substitutes across all manufacturers. Eight hard-reject rules eliminate impossible matches, nine weighted scoring factors rank what remains, and an optional AI post-filter catches edge cases. Results are classified as Direct Replacement, Functional Equivalent, Upgrade, Similar, or Budget Alternative.

3. **Generate submittals** — Assemble professional PDF packages with a branded cover sheet, landscape fixture schedule, and embedded manufacturer spec sheets. Per-item catalog number overrides via the ordering matrix configurator. Missing or corrupt spec sheets get clean placeholder pages.

All three workflows are available through a **Claude Sonnet chat agent** with five integrated tools (search, cross-reference, spec sheet lookup, submittal addition, fixture recommendation), or through dedicated UI pages.

---

## Manufacturer Coverage

| Manufacturer | Brands | Crawler |
|---|---|---|
| **Elite Lighting** | Elite, Maxilume | `lib/crawler/elite.ts` |
| **Acuity Brands** | Lithonia, Juno, Holophane, Peerless, Mark Architectural | `lib/crawler/acuity.ts` |
| **Contractor Select** | Contractor Select (Acuity value tier) | `lib/crawler/acuity-cs.ts` |
| **Cooper Lighting** | Metalux, Halo, Corelite, Lumark, McGraw-Edison, Fail-Safe, Ametrix | `lib/crawler/cooper.ts` |
| **Current Lighting** | Columbia, Prescolite, Kim, Litecontrol, AAL | `lib/crawler/current.ts` |
| **Lutron** | Ketra, Ivalo, Lumaris | `lib/crawler/lutron.ts` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Next.js 16 App Router                        │
│                                                                      │
│  /chat     /products     /cross-reference     /submittals    /admin   │
│    │            │                │                 │            │     │
│    └────────────┴────────────────┴─────────────────┴────────────┘     │
│                            API Routes                                 │
│   /api/chat   /api/products   /api/cross-reference   /api/submittals  │
│   /api/categories   /api/manufacturers   /api/admin/matrices          │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────▼──────┐  ┌─────▼───────┐  ┌─────▼──────────┐
     │ PostgreSQL   │  │ Cross-Ref   │  │ PDF Generator  │
     │ Prisma 5     │  │ Engine      │  │ pdf-lib        │
     │ tsvector     │  │ 8 rejects   │  │ cover + sched  │
     │ pg_trgm      │  │ 9 scores    │  │ + spec sheets  │
     └──────▲──────┘  └─────────────┘  └────────────────┘
            │
     ┌──────┴──────────────────────────────────────────────┐
     │              Offline Pipeline (ts-node)              │
     │                                                      │
     │  crawl.ts              Playwright + Cheerio scrapers  │
     │  extract-specs.ts      PDF → regex → AI fallback      │
     │  promote-specs.ts      Staging → live product fields   │
     │  classify-fixtures.ts  Category classification         │
     │  extract-matrices.ts   Ordering matrix extraction      │
     └──────────────────────────────────────────────────────┘
```

Crawlers and extraction scripts are standalone `ts-node` processes — not API routes. Playwright requires a full Chromium instance, and these pipelines can run for hours against large catalogs. They execute manually or via cron on a machine with Node and Chromium installed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Database | PostgreSQL 15+ with Prisma 5 ORM, `tsvector` + `pg_trgm` |
| AI Chat | Vercel AI SDK (`streamText`), Claude Sonnet, 5 tool definitions |
| AI Extraction | Anthropic SDK, Claude Sonnet (regex fallback), Claude Haiku (cross-ref filter) |
| Crawling | Playwright 1.58 + Cheerio (standalone scripts) |
| PDF Generation | pdf-lib (cover sheets, fixture schedules, assembly) |
| PDF Extraction | pdf-parse (spec sheet text extraction) |
| PDF Rendering | pdfjs-dist (client-side inline preview + annotation) |
| Auth | Clerk (optional — gracefully bypassed when env vars unset) |
| Styling | Tailwind CSS 4 + CSS custom properties design system |
| Icons | lucide-react |
| Testing | Vitest (unit tests) |

---

## Data Model

Eleven models, thirteen enums. Core relationships:

```
Manufacturer ──< Category (hierarchical tree per manufacturer)
Manufacturer ──< Product (50+ fields, fieldProvenance JSON per field)
Manufacturer ──< OrderingMatrix (configurable / SKU table / hybrid)
Manufacturer ──< CrawlLog (audit trail per crawl run)

Product ──< CrossReference (source) ──> Product (target)
Product ──< SubmittalItem ──> Submittal
Product ──> OrderingMatrix (optional, for part number configuration)

Chat ──> ChatProject (optional grouping)

CompanyBranding (singleton — company logo, contact info, preparedBy details)
```

### Key Design Decisions

**Field provenance.** Every extracted value on a `Product` records its `source` (REGEX, AI_FALLBACK, MANUAL), `confidence` (0–1), and `rawValue`. MANUAL fields are never overwritten by crawls. The UI surfaces confidence indicators so specifiers can judge data quality at a glance.

**Two-pass extraction.** Regex runs first — fast, deterministic, free. AI fallback fires only when overall confidence drops below threshold. This keeps API costs proportional to catalog complexity, not catalog size. On AI failure, confidence scores are degraded rather than silently preserved.

**Staged spec promotion.** Raw PDF text and AI outputs land in staging columns (`rawSpecText`, `specExtractionJson`). A separate `promote-specs` script validates and writes them to live product columns. A bad extraction run never clobbers production data.

**Range columns.** Many fixtures ship in wattage-selectable or lumen-selectable configurations. The schema carries both nominal values (`wattage`, `lumens`) and range columns (`wattageMin/Max`, `lumensMin/Max`) so the cross-reference engine can do range-overlap scoring instead of brittle point comparisons.

**Hard rejects before scoring.** The cross-reference engine applies binary pass/fail rules (voltage, mounting, environment, CCT, form factor) before computing weighted scores. This prevents wasting compute on obviously incompatible fixtures and keeps the scored result set meaningful.

**Company branding.** A singleton `CompanyBranding` record stores company logo (base64), address, phone, email, website, and preparedBy details. This data is pulled into every submittal PDF cover sheet, ensuring consistent branding across all generated packages.

---

## Cross-Reference Engine

The engine (`lib/cross-reference.ts`) is fully rule-based — no vector similarity.

### Category Pre-Filtering

The source fixture's **fixture group** (HIGH_BAY, TROFFER_PANEL, DOWNLIGHT, WALL_PACK, etc.) is determined from its category path. Candidates are built in three passes:

1. **Group pass** — same fixture group only. If >= 5 candidates, stop.
2. **Branch pass** — relax to same root category branch. If >= 5, stop.
3. **All pass** — no detectable category; fall back to all active products.

A high bay cross-reference will never surface a troffer or downlight.

### Hard Reject Rules

| Rule | Logic |
|---|---|
| Environment mismatch | INDOOR vs OUTDOOR (BOTH bypasses) |
| Emergency backup | Source requires it; target does not |
| Voltage incompatible | Mismatched voltages (UNIVERSAL and V120_277 bypass) |
| Mounting incompatible | No overlapping mounting types |
| CCT incompatible | Zero CCT overlap when source has 2+ defined options |
| Form factor | Incompatible sizes (2x4 vs 2x2, 4" vs 6") |
| Category mismatch | Different fixture groups (redundant safety net) |

### Scoring Factors (9 weighted, sum = 1.0)

| Factor | Weight |
|---|---|
| Form factor match | 0.20 |
| Lumens range overlap | 0.20 |
| CRI match | 0.10 |
| CCT options overlap | 0.10 |
| Dimming protocol | 0.10 |
| DLC listing | 0.10 |
| IP/NEMA rating | 0.10 |
| Wattage overlap | 0.05 |
| Physical dimensions | 0.05 |

Soft penalties (not hard rejects): wet location downgrade (-0.05), NEMA rating downgrade (-0.04).

### Match Classification

| Score | Type |
|---|---|
| >= 0.90 | DIRECT_REPLACEMENT |
| >= 0.75 | FUNCTIONAL_EQUIVALENT |
| >= 0.60 | UPGRADE (if target lumens > source x 1.1) or SIMILAR |
| < 0.60 | BUDGET_ALTERNATIVE |

---

## Chat Agent

Claude Sonnet with five tools, streamed via Vercel AI SDK:

| Tool | Purpose |
|---|---|
| `search_products` | Full-text + structured filter search (query, manufacturer, category, lumen/wattage ranges, CCT, CRI, environment, DLC, wet location) |
| `cross_reference` | Runs the matching engine against a catalog number |
| `get_spec_sheet` | Returns cached spec sheet PDF path for inline rendering |
| `add_to_submittal` | Adds a fixture to the most recent DRAFT submittal |
| `recommend_fixtures` | Given a fixture class and project context, returns ranked candidates |

The agent always calls `search_products` before `cross_reference` — it never guesses catalog numbers. Chat history persists to PostgreSQL with debounced saves. Conversations are trimmed at 20 messages; tool results older than position 10 are stripped to manage token count. Rate limited at 20 requests/IP/minute.

---

## Product Search

The search pipeline (`lib/products-search.ts`) uses a four-tier fallback strategy:

1. **Manufacturer-prefixed search** — If the query starts with a manufacturer name (e.g., "elite HH6"), splits into manufacturer filter + catalog/family prefix match across three buckets: exact catalog prefix, family name prefix, and display name prefix.

2. **Full-text search** — PostgreSQL `tsvector` with `plainto_tsquery` and `ts_rank` scoring. Handles multi-word queries and stemming.

3. **Fuzzy fallback** — `pg_trgm` `word_similarity` for typo-tolerant matching (e.g., "lithonya" finds "Lithonia"). Kicks in only when tsvector returns zero results.

4. **Structured filter query** — Pure filter-based fallback (manufacturer, category, fixture type, voltage, CCT, etc.) when no text query is provided or all text strategies fail.

All tiers support the same structured filters: manufacturer, category (with descendant inclusion), fixture type, min/max lumens/wattage, CCT, CRI, environment, DLC status, wet location, and voltage (with compatibility expansion — e.g., V277 also matches V120_277 and UNIVERSAL).

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with `pg_trgm` extension
- Anthropic API key

### Setup

```bash
# Install dependencies
npm install

# Install Playwright Chromium (for crawling)
npx playwright install chromium

# Configure environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/atlantiskb_lighting"
#   ANTHROPIC_API_KEY="sk-ant-..."

# Run database migrations
npx prisma migrate deploy

# Apply tsvector + pg_trgm trigger (required after every migration)
psql $DATABASE_URL < prisma/migrations/001_search_vector_trigger.sql

# Seed manufacturers and root categories
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Crawling a Manufacturer

```bash
# Crawl a specific manufacturer
npm run crawl -- --manufacturer=elite
npm run crawl -- --manufacturer=acuity
npm run crawl -- --manufacturer=cooper
npm run crawl -- --manufacturer=current
npm run crawl -- --manufacturer=lutron

# Crawl specific categories only
npm run crawl -- --manufacturer=elite --categories=interior-lighting,exterior-lighting
```

### Spec Extraction Pipeline

```bash
# 1. Extract specs from downloaded PDFs (10x concurrent workers)
npm run extract-specs

# 2. Promote staged extractions to live product columns
npm run promote-specs

# 3. Classify fixture types
npm run classify        # Rule-based
npm run classify:ai     # AI-assisted for unresolved types

# 4. Extract ordering matrices from spec sheets
npm run extract-matrices
```

---

## Testing

Unit tests use [Vitest](https://vitest.dev/) with 271 specs across 6 test files:

| Test file | Coverage | Specs |
|---|---|---|
| `parser.test.ts` | Regex extraction, confidence scoring, field validation | 82 |
| `normalize.test.ts` | Voltage, dimming, mounting, form factor normalization | 55 |
| `configurator.test.ts` | Catalog string building, parsing, matrix validation | 46 |
| `validations.test.ts` | Zod schemas for all API inputs | 41 |
| `cross-reference.test.ts` | Hard rejects, scoring, match classification | 40 |
| `rate-limit.test.ts` | Per-IP rate limiting, window reset | 7 |

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude API key (chat, extraction, cross-ref filter) |
| `CLERK_SECRET_KEY` | No | Enables Clerk authentication |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | No | Clerk frontend key |
| `CLAUDE_MODEL` | No | Override extraction model (default: `claude-sonnet-4-6`) |
| `CLAUDE_FAST_MODEL` | No | Override cross-ref filter model (default: `claude-haiku-4-5-20251001`) |

When Clerk env vars are unset, authentication is bypassed entirely. A warning is logged in production to prevent accidental unauthenticated deployments.

---

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run crawl` | Playwright crawler (all manufacturers) |
| `npm run crawl:acuity` | Crawl Acuity Brands |
| `npm run crawl:cooper` | Crawl Cooper Lighting |
| `npm run crawl:current` | Crawl Current Lighting |
| `npm run crawl:lutron` | Crawl Lutron |
| `npm run extract-specs` | PDF spec extraction via Claude |
| `npm run promote-specs` | Promote staged extractions to live columns |
| `npm run classify` | Rule-based fixture classification |
| `npm run classify:ai` | AI-assisted classification |
| `npm run extract-matrices` | Extract ordering matrices from spec sheets |
| `npm run backfill:acuity-pdfs` | Backfill missing Acuity spec sheet PDFs |
| `npm run backfill:acuity-thumbs` | Backfill missing Acuity thumbnails |
| `npm run backfill:cooper-thumbs` | Backfill missing Cooper thumbnails |
| `npm run backfill:elite-thumbs` | Backfill missing Elite thumbnails |
| `npm run backfill:current-thumbs` | Backfill missing Current thumbnails |
| `npm run db:migrate` | Create + apply Prisma migration |
| `npm run db:migrate:deploy` | Deploy pending migrations (CI/production) |
| `npm run db:push` | Push schema changes without migration |
| `npm run db:seed` | Seed manufacturers + root categories |
| `npm run db:studio` | Open Prisma Studio |

---

## Security

- **SQL injection**: All queries parameterized via Prisma template literals. Search input length-capped at 200 characters.
- **Path traversal**: Spec sheet paths resolved with `path.resolve()` and validated against the `public/` boundary.
- **Auth**: Admin routes protected with `requireAuth()`. Auth bypassed with logged warning when Clerk env vars unset.
- **Internal field stripping**: `rawSpecText`, `specExtractionJson`, `specEvidenceJson`, `crawlEvidence` stripped from all API responses.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` applied globally.
- **Rate limiting**: IP-based, 20 req/min on chat endpoint. In-memory with 60s cleanup.
- **Request guards**: Messages array capped at 100/request. Pagination capped at 100 results/page. String fields length-validated.
- **Error handling**: Server-side logging with generic client responses. No stack traces or Prisma errors exposed. Global error boundary with error digest IDs.

---

## Full-Text Search

The `searchVector` column is `Unsupported("tsvector")` in the Prisma schema — Prisma does not create or manage it. It is populated by a `BEFORE INSERT OR UPDATE` trigger. The same migration enables `pg_trgm` for typo-tolerant fuzzy fallback.

If search returns no results after a schema migration, the trigger was dropped:

```bash
psql $DATABASE_URL < prisma/migrations/001_search_vector_trigger.sql
```

---

## Roadmap

| Version | Feature |
|---|---|
| v2 | Clerk authentication, multi-tenant projects, client-facing submittal portal |
| v2 | Redis-backed rate limiting, strict CSP, CSRF tokens |
| v2.5 | pgvector embeddings for semantic product similarity search |
| v3 | Migration under `/lighting/` in the `atlantiskb-home` monorepo |
