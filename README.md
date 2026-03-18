# Atlantis KB — Lighting Expert

A full-stack commercial lighting specification tool with a streaming AI chat interface. It crawls manufacturer catalogs across five brands, runs a two-pass spec extraction pipeline (regex → Claude AI fallback), stores normalized fixture data in PostgreSQL, surfaces everything through a Claude Sonnet agent with five tool calls, runs a category-aware cross-reference engine for finding equivalent products, and generates professional PDF submittal packages.

---

## What It Does

Lighting designers and contractors deal with three workflows constantly:

1. **Spec a fixture** — find and verify exact wattage, CCT, CRI, voltage, DLC status, and form factor for a product from any of the five supported manufacturers
2. **Cross-reference alternatives** — when a product is discontinued or over-budget, find functionally equivalent substitutes ranked by confidence score, scoped to the same fixture category
3. **Produce submittals** — assemble a PDF package (cover sheet + fixture schedule + embedded manufacturer spec sheets) to submit to architects or owners for approval

All three are accessible through a streaming chat interface backed by a Claude Sonnet 4.6 agent with five database tools, or directly through the web UI pages.

---

## Manufacturer Coverage

| Manufacturer | Brands Included | Status |
|---|---|---|
| **Elite Lighting** | Elite, Maxilume | ✅ Fully crawled + extracted |
| **Acuity Brands** | Lithonia Lighting, Juno, Holophane, Peerless, Mark Architectural | ✅ Crawled + extracted |
| **Cooper Lighting Solutions** | Metalux, Halo, Corelite, Lumark, McGraw-Edison, Fail-Safe, Ametrix | ✅ Crawled + extracted |
| **Current Lighting** | Columbia, Prescolite, Kim, Litecontrol, Architectural Area Lighting | ✅ Crawled + extracted |
| **Lutron** | Ketra, Ivalo, Lumaris | ✅ Crawled + extracted |

Spec extraction runs in a separate pipeline (`extract-specs` → `promote-specs`) using concurrent PDF parsing with a Claude Haiku AI fallback for products where regex confidence falls below threshold.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.7 App Router, React 19, TypeScript 5 |
| Database | PostgreSQL 14+ + Prisma 5 ORM |
| AI Chat Agent | `@ai-sdk/anthropic`, Claude Sonnet 4.6, 5 tool calls, streaming |
| AI Spec Extraction | `@anthropic-ai/sdk`, Claude Haiku (two-pass extraction fallback) |
| AI Cross-Ref Filter | Claude Haiku (post-score fixture sanity check) |
| Web Crawling | Playwright 1.58 + Cheerio (standalone `ts-node`, not serverless) |
| PDF Extraction | pdf-parse |
| PDF Generation | pdf-lib |
| PDF Rendering | pdfjs-dist (client-side inline preview + annotation) |
| Search | PostgreSQL `tsvector` + `plainto_tsquery` + `pg_trgm` fuzzy fallback |
| Icons | lucide-react |
| Styling | Tailwind CSS 4 + inline design system |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                        │
│                                                                  │
│  /chat   /products   /cross-reference   /submittals   /admin     │
│    │          │              │               │           │       │
│    └──────────┴──────────────┴───────────────┴───────────┘       │
│                           API Routes                             │
│   /api/chat    /api/products    /api/cross-reference             │
│   /api/submittals/**   /api/categories   /api/manufacturers      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────────┐
   │  PostgreSQL  │  │  Cross-Ref  │  │  PDF Generator │
   │  (Prisma 5)  │  │  Engine     │  │  (pdf-lib)     │
   └──────▲──────┘  └─────────────┘  └────────────────┘
          │
   ┌──────┴──────────────────────────────────────────┐
   │              Offline Pipeline (ts-node)          │
   │                                                  │
   │  scripts/crawl.ts          (Playwright crawler)  │
   │  scripts/extract-specs-from-pdfs.ts  (10x pool)  │
   │  scripts/promote-extractions.ts      (stage→prod) │
   │  scripts/classify-fixtures.ts        (category)   │
   └──────────────────────────────────────────────────┘
```

The crawler and extraction pipeline are standalone `ts-node` scripts, not API routes. Playwright can't run serverless, and the pipeline is long-running. These run manually or via cron on a machine with Node + Chromium installed.

---

## Data Model

```
Manufacturer ──< Category (hierarchical tree) ──< Product
Product ──< CrossReference (as source)
Product ──< CrossReference (as target)
Product ──< SubmittalItem ──> Submittal
Submittal ──> Project
Manufacturer ──< CrawlLog
Chat (messages stored as JSON column)
```

### Key design decisions

**Field provenance** — every extracted field on a `Product` carries a `fieldProvenance` JSON object tracking `source` (REGEX | AI_FALLBACK | MANUAL | EMPTY) and `confidence` (0–1). The UI highlights low-confidence fields in orange and manually-corrected fields in blue. MANUAL fields are never overwritten by subsequent crawl or extraction runs.

**Staged spec extraction** — raw PDF text and AI extraction results are written to staging columns (`rawSpecText`, `specExtractionJson`, `specEvidenceJson`) first. A separate `promote-specs` script validates and writes them to the live product columns. This keeps a dirty extraction run from clobbering production data.

**Range columns** — many fixtures ship in wattage-selectable or lumen-selectable configurations. The schema carries both nominal values (`wattage`, `lumens`) and range columns (`wattageMin/Max`, `lumensMin/Max`) so the cross-reference engine can do range-overlap scoring instead of brittle point comparisons.

**Full-text search** — product text is maintained in a PostgreSQL `tsvector` column via a `BEFORE INSERT OR UPDATE` trigger. Queries use `plainto_tsquery` with `ts_rank` ordering for primary results, falling back to `pg_trgm` word-similarity scoring to catch typos and partial catalog numbers. The trigger must be applied manually after `db migrate` (see setup).

**Category tree** — each manufacturer has an independent hierarchical category tree (root → family → sub-family). The `path` field is immutable after creation and tree-local (e.g., `interior-lighting/high-bay-low-bay`). The cross-reference engine uses these paths as the primary fixture-type signal.

---

## Chat Agent

The main interface is a streaming chat backed by Claude Sonnet 4.6 with five tools:

| Tool | What it does |
|---|---|
| `search_products` | Full-text + structured filter search. Accepts query, manufacturer, categorySlug, minLumens, maxWattage, CCT, minCRI, environment, DLC, wetLocation. Typo-tolerant via pg_trgm fallback. |
| `cross_reference` | Runs the category-aware matching engine against a real catalog number. Returns top matches with confidence score, match type, and important spec deltas. |
| `get_spec_sheet` | Returns the cached spec sheet PDF path for inline rendering. Handles both exact-product and family-level spec sheets. |
| `add_to_submittal` | Adds a fixture to the most recent DRAFT submittal (or creates one). Auto-assigns the next available fixture type letter. |
| `recommend_fixtures` | Given a fixture class and project context (space type, mounting height, target lumens, etc.), returns a ranked shortlist of candidates with justification. |

The agent is instructed to call `search_products` before `cross_reference` — it never guesses or constructs catalog numbers from partial user input. When a user mentions a fixture type (highbay, troffer, downlight, etc.), the agent maps it to a `categorySlug` parameter to constrain the search to the right fixture group.

Chat history is persisted to PostgreSQL (debounced save, 800ms) and available in the sidebar by session. Conversations are trimmed at 20 messages for context; tool results older than position 10 from the end are stripped to avoid token bloat.

---

## Spec Extraction Pipeline

Spec extraction runs as a two-stage offline process separate from the live crawl:

```
scripts/extract-specs-from-pdfs.ts
  └─ For each product with a spec sheet PDF:
      1. Extract text via pdf-parse (strips null bytes)
      2. Regex pass: attempt to extract all spec fields
      3. If overall confidence < 0.5: Claude Haiku AI fallback
      4. Write results to staging columns (rawSpecText, specExtractionJson)
      5. 10x concurrent workers (configurable via --concurrency=N)

scripts/promote-extractions.ts
  └─ For each product with a staged extraction:
      1. Validate field types and confidence scores
      2. Skip MANUAL-sourced fields (never overwrite)
      3. Write to live product columns with provenance metadata
      4. Log promotion stats (fields written, skipped, confidence distribution)
```

The AI extraction uses Claude Haiku (not Sonnet) to keep costs manageable. At current pricing, extraction runs approximately $0.004–$0.018 per product depending on spec sheet length and model. The 10x concurrency pool processes a 3,000-product catalog in roughly 15–20 minutes.

---

## Cross-Reference Engine

The engine (`lib/cross-reference.ts`) is fully rule-based — no vector similarity.

### Category pre-filtering

Before any scoring, the engine determines the source fixture's **fixture group** (HIGH_BAY, TROFFER_PANEL, DOWNLIGHT, WALL_PACK, etc.) from its category path using an authoritative `PATH_SEGMENT_TO_GROUP` map of ~90 category slug entries.

The candidate pool is built in three passes:

1. **Group pass** — only products in the same fixture group. If ≥ 5 candidates, stop.
2. **Branch pass** — relax to same root category branch (interior vs exterior). If ≥ 5, stop.
3. **All pass** — source has no detectable category; fall back to all active products.

A highbay cross-reference will never surface a troffer or downlight regardless of how similar their specs look.

### Hard rejects (8 rules)

Any failing rule immediately eliminates a candidate:

| Rule | Logic |
|---|---|
| Category group mismatch | Different fixture groups (belt + suspenders after pre-filter) |
| Environment mismatch | INDOOR vs OUTDOOR (BOTH bypasses) |
| Emergency backup | Source requires it; target does not |
| Wet location | Source rated wet; target is not |
| NEMA downgrade | Source specifies NEMA; target does not |
| Voltage incompatible | Mismatched (UNIVERSAL and V120_277 bypass) |
| Mounting incompatible | No overlapping mounting type |
| Form factor | Both specify incompatible form factors (2×4 ≠ 2×2) |

### Scoring (9 weighted factors, sum = 1.0)

| Factor | Weight |
|---|---|
| Form factor match | 0.20 |
| Lumens range overlap | 0.20 |
| CRI match | 0.10 |
| CCT options overlap | 0.10 |
| Dimming protocol | 0.10 |
| DLC listing status | 0.10 |
| IP/NEMA rating | 0.10 |
| Wattage range overlap | 0.05 |
| Physical dimensions | 0.05 |

### AI post-filter

After scoring, the top 5 candidates go through a Claude Haiku fixture-type sanity check that removes obvious mismatches slipping through (sign lights, roadway fixtures, exit/emergency, sensors). With category pre-filtering in place this rarely fires, but it's a useful last-line safety net.

### Match types

| Score | Match type |
|---|---|
| ≥ 0.90 | DIRECT_REPLACEMENT |
| ≥ 0.75 | FUNCTIONAL_EQUIVALENT |
| ≥ 0.60 | UPGRADE (if target lumens > source × 1.1) or SIMILAR |
| < 0.60 | BUDGET_ALTERNATIVE |

---

## Security

The following hardening measures are in place as of v1:

- **SQL injection**: search input is length-capped (200 chars) and passed to Prisma's `$queryRaw` template literals which parameterize correctly. Manual escaping removed.
- **Path traversal**: all spec sheet paths resolved with `path.resolve()` and validated against the `public/` boundary before file read.
- **Internal field exposure**: `rawSpecText`, `specExtractionJson`, `specEvidenceJson`, `crawlEvidence` are stripped from all API responses before sending to clients.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` applied globally via `next.config.ts`.
- **Error sanitization**: all catch blocks log full errors server-side and return generic messages to clients. No stack traces or Prisma error details leave the server.
- **Env var validation**: `ANTHROPIC_API_KEY` checked at startup with a clear error; no non-null assertions on required secrets.
- **Rate limiting**: IP-based, 20 req/min on the chat endpoint. In-memory Map with 60s cleanup to prevent unbounded growth.
- **DoS guards**: messages array capped at 100 per request; pagination capped at 100 results/page.
- **Next.js CVEs**: running 16.1.7 — patches CSRF bypass, HTTP request smuggling, and two DoS vulnerabilities present in 16.1.6 and earlier.

Not in scope for v1: authentication (Clerk planned for v2), Redis-backed rate limiting, CSRF tokens, strict CSP.

---

## Directory Structure

```
atlantiskb-lighting/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                  # POST streaming chat, rate-limited by IP
│   │   ├── products/route.ts              # GET list (search, filter, paginate)
│   │   ├── products/[id]/route.ts         # GET detail, PUT edit with provenance
│   │   ├── categories/route.ts            # GET category tree
│   │   ├── manufacturers/route.ts         # GET manufacturer list (capped at 100)
│   │   ├── cross-reference/route.ts       # GET ?catalogNumber -> matching engine
│   │   ├── submittals/route.ts            # GET list, POST create
│   │   ├── submittals/[id]/route.ts       # GET, PUT, item ops
│   │   ├── submittals/[id]/generate/      # POST -> assemble + save PDF
│   │   ├── projects/route.ts              # GET/POST project management
│   │   ├── chats/route.ts                 # GET/POST chat sessions
│   │   └── crawl-log/route.ts             # GET crawl history
│   ├── chat/[id]/page.tsx                 # Chat session page
│   ├── products/page.tsx                  # Product browser
│   ├── products/[id]/page.tsx             # Product detail + inline editor
│   ├── submittals/page.tsx                # Submittal list
│   ├── submittals/[id]/page.tsx           # Submittal detail + PDF generator
│   ├── cross-reference/page.tsx           # Manual cross-reference UI
│   ├── admin/page.tsx                     # Stats + crawl log
│   ├── layout.tsx                         # Root layout (sidebar + topbar)
│   ├── error.tsx                          # Global error boundary (generic message)
│   └── loading.tsx                        # Global loading skeleton
├── components/
│   ├── ChatInterface.tsx                  # Streaming chat, tool result rendering
│   ├── ChatMessage.tsx                    # Message bubble + tool call display
│   ├── ProductInlineCard.tsx              # Compact product card in chat results
│   ├── SpecSheetPreview.tsx               # Inline PDF viewer (pdfjs-dist)
│   ├── PdfAnnotator.tsx                   # PDF markup: highlight + text boxes + download
│   ├── CrossReferenceResult.tsx           # Match card + spec delta table
│   ├── Topbar.tsx / Sidebar.tsx           # Shell navigation
│   ├── ProductCard.tsx                    # Confidence badge + catalog number
│   ├── ProductEditor.tsx                  # Inline spec editor + provenance badges
│   ├── SubmittalBuilder.tsx               # Project info + fixture add form
│   ├── FixtureScheduleTable.tsx           # Drag-reorder fixture schedule
│   ├── SpecBadge.tsx                      # Source/confidence badge component
│   └── EmptyState.tsx
├── lib/
│   ├── agent/
│   │   ├── system-prompt.ts               # Claude agent instructions + tool guidance
│   │   ├── tools.ts                       # 5 tool definitions (Zod schemas + execute)
│   │   ├── rate-limit.ts                  # In-memory rate limiter (20 req/min, auto-cleanup)
│   │   └── recommend.ts                   # Fixture class inference + candidate ranking
│   ├── crawler/
│   │   ├── elite.ts                       # Elite Lighting Playwright crawler
│   │   ├── parser.ts                      # Two-pass regex + AI extraction pipeline
│   │   └── normalize.ts                   # Voltage/dimming/mounting normalization maps
│   ├── pdf/
│   │   ├── cover-sheet.ts                 # US Letter title page
│   │   ├── fixture-schedule.ts            # Landscape schedule table (13 cols)
│   │   └── submittal-generator.ts         # PDF assembly orchestrator (path-traversal safe)
│   ├── cross-reference.ts                 # Category pre-filter + hard rejects + scoring
│   ├── products-search.ts                 # tsvector + pg_trgm fuzzy query builder
│   ├── storage.ts                         # Spec sheet + submittal file I/O
│   ├── thumbnails.ts                      # Thumbnail generation
│   ├── categoryLabels.ts                  # Human-readable category label map
│   ├── db.ts                              # Prisma singleton
│   └── types.ts                           # Shared TypeScript types
├── prisma/
│   ├── schema.prisma                      # 8 models, 7 enums
│   ├── seed.ts                            # Seeds manufacturers + root categories
│   └── migrations/
│       └── 001_search_vector_trigger.sql  # tsvector + pg_trgm trigger (apply after migrate)
├── scripts/
│   ├── crawl.ts                           # CLI entry point (--manufacturer=elite|acuity|cooper|current|lutron)
│   ├── extract-specs-from-pdfs.ts         # 10x concurrent PDF → staged extraction
│   ├── promote-extractions.ts             # Stage → live product columns
│   ├── classify-fixtures.ts               # Rule-based fixture category classification
│   ├── classify-fixtures-ai.ts            # AI-assisted fixture classification
│   ├── backfill-thumbnails.ts             # Elite thumbnail backfill
│   ├── backfill-acuity-pdfs.ts            # Acuity spec sheet backfill
│   ├── backfill-acuity-thumbs.ts          # Acuity thumbnail backfill
│   ├── backfill-cooper-thumbs.ts          # Cooper thumbnail backfill
│   ├── backfill-current-thumbs.ts         # Current Lighting thumbnail backfill
│   └── add-acuity-categories.ts           # Acuity category tree seeding
├── public/
│   ├── spec-sheets/                       # Cached manufacturer PDFs (gitignored)
│   ├── submittals/                        # Generated submittal PDFs (gitignored)
│   └── thumbnails/                        # Product thumbnails (gitignored)
└── tsconfig.scripts.json                  # CommonJS tsconfig for ts-node scripts
```

---

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ with the `pg_trgm` extension available
- `.env` (gitignored):

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/atlantiskb_lighting"
ANTHROPIC_API_KEY="sk-ant-..."
```

### Install and initialize

```bash
# Install dependencies
npm install

# Install Playwright Chromium (needed for crawling)
npx playwright install chromium

# Run database migrations
npx prisma migrate deploy

# Apply the tsvector + pg_trgm trigger (required after every schema migration)
psql $DATABASE_URL < prisma/migrations/001_search_vector_trigger.sql

# Seed manufacturers and root categories
npm run db:seed

# Start dev server
npm run dev
```

Open http://localhost:3000.

> **Note on `db:push`:** The `db:push` command is intentionally gated behind `FORCE=1` to prevent accidental data loss. Use `prisma migrate dev` for schema changes during development and `prisma migrate deploy` for production. Only use `FORCE=1 npm run db:push` if you know what you're doing.

### Crawling

```bash
# Crawl all supported manufacturers (long-running)
npm run crawl

# Crawl a specific manufacturer
npm run crawl:acuity
npm run crawl:cooper
npm run crawl:current
npm run crawl:lutron
```

### Spec extraction pipeline

```bash
# Step 1: Extract specs from downloaded PDFs (10x concurrent workers)
npm run extract-specs

# Optional: control concurrency
npx ts-node --project tsconfig.scripts.json scripts/extract-specs-from-pdfs.ts --concurrency=5

# Step 2: Promote staged extractions to live product columns
npm run promote-specs
```

### Useful database commands

```bash
npx prisma migrate dev       # Create + apply a new migration
npx prisma migrate deploy    # Apply pending migrations (production)
npm run db:seed              # Re-seed manufacturers + categories
npm run db:studio            # Browse data in Prisma Studio GUI
```

---

## npm Scripts Reference

| Script | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run crawl` | Run Playwright crawler (all manufacturers) |
| `npm run crawl:acuity` | Crawl Acuity Brands only |
| `npm run crawl:cooper` | Crawl Cooper Lighting only |
| `npm run crawl:current` | Crawl Current Lighting only |
| `npm run crawl:lutron` | Crawl Lutron only |
| `npm run extract-specs` | Run 10x concurrent spec extraction pipeline |
| `npm run promote-specs` | Promote staged extractions to live columns |
| `npm run classify` | Rule-based fixture category classification |
| `npm run classify:ai` | AI-assisted fixture classification |
| `npm run backfill:elite-thumbs` | Backfill Elite product thumbnails |
| `npm run backfill:acuity-pdfs` | Backfill Acuity spec sheet PDFs |
| `npm run backfill:acuity-thumbs` | Backfill Acuity thumbnails |
| `npm run backfill:cooper-thumbs` | Backfill Cooper thumbnails |
| `npm run backfill:current-thumbs` | Backfill Current Lighting thumbnails |
| `npm run db:migrate` | Create + apply a new Prisma migration |
| `npm run db:seed` | Seed manufacturers + root categories |
| `npm run db:studio` | Open Prisma Studio |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Used by chat agent (Claude Sonnet 4.6), spec extraction fallback (Claude Haiku), and cross-reference post-filter (Claude Haiku) |

---

## Full-Text Search Note

The `searchVector` column is `Unsupported("tsvector")` in the Prisma schema — Prisma does not create or manage it. It is populated by a `BEFORE INSERT OR UPDATE` trigger in `prisma/migrations/001_search_vector_trigger.sql`. The same migration enables `pg_trgm` for the typo-tolerant fuzzy fallback path.

**If the search bar returns no results after a schema migration**, the trigger was dropped and needs to be re-applied:

```bash
psql $DATABASE_URL < prisma/migrations/001_search_vector_trigger.sql
```

---

## Roadmap

| Version | Feature |
|---|---|
| **v1.x** | Finish extracting remaining ~3,500 products (Haiku, ~$3–4), re-run promote-specs |
| **v2** | Clerk authentication, multi-tenant projects, client-facing submittal portal |
| **v2** | Redis-backed rate limiting, strict CSP, CSRF tokens (requires auth sessions) |
| **v2.5** | pgvector embeddings for semantic similarity search across product descriptions |
| **v3** | Migration under `/lighting/` in the `atlantiskb-home` monorepo |
