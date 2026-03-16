# Atlantis KB — Lighting Expert

A full-stack commercial lighting specification tool with an AI chat interface. It crawls manufacturer catalogs, normalizes and stores fixture data in PostgreSQL, surfaces everything through a streaming chat agent with tool-calling, runs a category-aware cross-reference engine for finding equivalent products across five manufacturers, and generates professional PDF submittal packages.

---

## What It Does

Lighting designers and contractors deal with three workflows constantly:

1. **Spec a fixture** — find and verify exact wattage, CCT, CRI, voltage, DLC status, and form factor for a product from any of the five supported manufacturers
2. **Cross-reference alternatives** — when a product is discontinued or over-budget, find functionally equivalent substitutes ranked by confidence, scoped to the same fixture category
3. **Produce submittals** — assemble a PDF package (cover sheet + fixture schedule + embedded spec sheets) to submit to architects or owners for approval

All three are accessible through a streaming chat interface backed by a Claude AI agent with four database tools, or directly through the web UI pages.

---

## Manufacturer Coverage

| Manufacturer | Brands Included |
|---|---|
| **Acuity Brands** | Lithonia Lighting, Juno, Holophane, Peerless, Mark Architectural |
| **Cooper Lighting Solutions** | Metalux, Halo, Corelite, Lumark, McGraw-Edison, Fail-Safe, Ametrix |
| **Elite Lighting** | Elite, Maxilume |
| **Current Lighting** | Columbia, Prescolite, Kim, Litecontrol, Architectural Area Lighting |
| **Lutron** | Ketra, Ivalo, Lumaris |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript 5 |
| Database | PostgreSQL + Prisma 5 ORM |
| AI Agent | `@ai-sdk/anthropic` streaming, Claude Sonnet 4.6, 4 tool calls |
| AI Verification | Claude Haiku 4.5 (cross-reference post-filter) |
| Web Crawling | Playwright 1.58 + Cheerio (standalone ts-node script) |
| PDF Extraction | pdf-parse |
| PDF Generation | pdf-lib |
| PDF Rendering | pdfjs-dist (client-side inline preview) |
| Icons | lucide-react |
| Styling | Tailwind CSS 4 + inline design system |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Next.js App Router                      │
│                                                              │
│  /chat   /products   /cross-reference   /submittals  /admin  │
│    │          │              │               │           │   │
│    └──────────┴──────────────┴───────────────┴───────────┘   │
│                         API Routes                           │
│   /api/chat    /api/products    /api/cross-reference         │
│   /api/submittals/**   /api/categories   /api/manufacturers  │
└───────────────────────────┬──────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────────┐
    │  PostgreSQL  │  │  Cross-Ref  │  │  PDF Generator │
    │  (Prisma 5)  │  │  Engine     │  │  (pdf-lib)     │
    └──────▲──────┘  └─────────────┘  └────────────────┘
           │
    ┌──────┴────────────────────────────┐
    │  scripts/crawl.ts (standalone)    │
    │  ┌────────────────────────────┐   │
    │  │  Playwright crawler        │   │
    │  │  - Sitemap discovery       │   │
    │  │  - PDF download + parse    │   │
    │  │  - Regex extraction        │   │
    │  │  - Claude AI fallback      │   │
    │  └────────────────────────────┘   │
    └───────────────────────────────────┘
```

The crawler is a standalone `ts-node` script, not a Next.js API route. Playwright cannot run in serverless environments, and the crawl job is long-running (minutes to hours for a full catalog). Run it manually or via cron on any machine with Node and a Chromium install.

---

## Data Model

```
Manufacturer ──< Category (hierarchical tree) ──< Product
Product ──< CrossReference (as source)
Product ──< CrossReference (as target)
Product ──< SubmittalItem ──> Submittal
Manufacturer ──< CrawlLog
Chat ──< (messages stored as JSON)
```

### Key design decisions

**Field provenance** — every extracted field on a `Product` carries a `fieldProvenance` JSON object tracking `source` (REGEX | AI_FALLBACK | MANUAL | EMPTY) and `confidence` (0–1). The UI shows orange highlights on low-confidence fields and blue badges on manually-corrected ones. MANUAL fields are never overwritten by subsequent crawl runs.

**Range columns** — many fixtures ship in wattage-selectable or lumen-selectable configurations. The schema carries both nominal values (`wattage`, `lumens`) and range columns (`wattageMin`, `wattageMax`, `lumensMin`, `lumensMax`) so the cross-reference engine can do proper range-overlap scoring instead of point comparisons.

**Full-text search** — product text is maintained in a PostgreSQL `tsvector` column via a `BEFORE INSERT OR UPDATE` trigger. Queries use `plainto_tsquery` with `ts_rank` ordering. The trigger must be applied manually after `db push` (see setup below).

**Category tree** — each manufacturer has an independent hierarchical category tree (root → family → sub-family). Category `path` is immutable after creation and tree-local (e.g., `interior-lighting/high-bay-low-bay`). The cross-reference engine uses these paths as the primary fixture-type signal.

---

## Chat Agent

The main interface is a streaming chat backed by a Claude Sonnet agent with four tools:

| Tool | What it does |
|---|---|
| `search_products` | Full-text + structured filter search. Accepts query, manufacturer, categorySlug, minLumens, maxWattage, CCT, minCRI, environment, DLC, wetLocation. |
| `cross_reference` | Runs the category-aware matching engine against a real catalog number. Returns top matches with confidence, match type, and important differences. |
| `get_spec_sheet` | Returns the cached spec sheet PDF path for inline rendering. |
| `add_to_submittal` | Adds a fixture to the most recent DRAFT submittal (or creates one). |

The agent is instructed to call `search_products` before `cross_reference` — it never guesses or constructs catalog numbers from partial user input. When a user mentions a fixture type (highbay, troffer, downlight, etc.), the agent maps it to a `categorySlug` parameter to constrain the search.

Chat history is persisted to PostgreSQL (debounced save, 800ms) and available in the sidebar by session.

---

## Cross-Reference Engine

The engine (`lib/cross-reference.ts`) is rule-based.

### Category pre-filtering

Before any scoring, the engine determines the source fixture's **fixture group** (HIGH_BAY, TROFFER_PANEL, DOWNLIGHT, WALL_PACK, etc.) from its category path. This uses an authoritative `PATH_SEGMENT_TO_GROUP` map of ~90 category slug entries — not regex guessing.

The candidate pool is built in three passes:

1. **Group pass** — only products in the same fixture group (e.g., only highbays for a highbay source). If ≥5 candidates, stop here.
2. **Branch pass** — relax to the same root category branch (interior vs exterior). If ≥5 candidates, stop here.
3. **All pass** — source has no detectable category; fall back to all active products.

This means a highbay cross-reference will never surface a troffer or downlight, regardless of how similar their specs look.

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
| Form factor | Both specify different incompatible form factors (2X4 ≠ 2X2) |

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

### AI verification

After scoring, the top 5 candidates are sent to Claude Haiku for a fixture-type sanity check. It removes obvious mismatches that slip through (sign lights, roadway fixtures, exit/emergency, sensors). With category pre-filtering in place this rarely fires, but it's a useful safety net.

### Match types

| Score | Match type |
|---|---|
| ≥ 0.90 | DIRECT_REPLACEMENT |
| ≥ 0.75 | FUNCTIONAL_EQUIVALENT |
| ≥ 0.60 | UPGRADE (if target lumens > source × 1.1) or SIMILAR |
| < 0.60 | BUDGET_ALTERNATIVE |

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
│   │   ├── manufacturers/route.ts         # GET manufacturer list
│   │   ├── cross-reference/route.ts       # GET ?catalogNumber -> matching engine
│   │   ├── submittals/route.ts            # GET list, POST create
│   │   ├── submittals/[id]/route.ts       # GET, PUT, item ops
│   │   ├── submittals/[id]/generate/      # POST -> assemble + save PDF
│   │   ├── projects/route.ts              # GET/POST project management
│   │   ├── chats/route.ts                 # GET/POST chat sessions
│   │   └── crawl-log/route.ts             # GET crawl history
│   ├── chat/[id]/page.tsx                 # Chat session page
│   ├── products/page.tsx                  # Product browser
│   ├── products/[id]/page.tsx             # Product detail + editor
│   ├── submittals/page.tsx                # Submittal list
│   ├── submittals/[id]/page.tsx           # Submittal detail + PDF generator
│   ├── cross-reference/page.tsx           # Manual cross-reference UI
│   ├── admin/page.tsx                     # Stats + crawl log
│   ├── layout.tsx                         # Root layout (sidebar + topbar)
│   ├── error.tsx                          # Global error boundary
│   └── loading.tsx                        # Global loading skeleton
├── components/
│   ├── ChatInterface.tsx                  # Streaming chat, tool result rendering
│   ├── ChatMessage.tsx                    # Message bubble + tool call display
│   ├── ProductInlineCard.tsx              # Compact product card in chat results
│   ├── SpecSheetPreview.tsx               # Inline PDF viewer (pdfjs-dist)
│   ├── CrossReferenceResult.tsx           # Match card + delta table
│   ├── Topbar.tsx / Sidebar.tsx           # Shell navigation
│   ├── ProductCard.tsx                    # Confidence badge + catalog number
│   ├── ProductEditor.tsx                  # Inline spec editor + provenance badges
│   ├── SubmittalBuilder.tsx               # Project info + fixture add form
│   ├── FixtureScheduleTable.tsx           # Drag-reorder fixture schedule
│   ├── PdfAnnotator.tsx                   # PDF markup tool
│   └── EmptyState.tsx
├── lib/
│   ├── agent/
│   │   ├── system-prompt.ts               # Claude agent instructions + tool guidance
│   │   └── tools.ts                       # 4 tool definitions (Zod schemas + execute)
│   ├── crawler/
│   │   ├── elite.ts                       # Elite Lighting Playwright crawler
│   │   ├── parser.ts                      # Two-pass regex + AI extraction pipeline
│   │   └── normalize.ts                   # Voltage/dimming/mounting normalization maps
│   ├── pdf/
│   │   ├── cover-sheet.ts                 # US Letter title page
│   │   ├── fixture-schedule.ts            # Landscape schedule table (13 cols)
│   │   └── submittal-generator.ts         # PDF assembly orchestrator
│   ├── cross-reference.ts                 # Category pre-filter + hard rejects + scoring
│   ├── products-search.ts                 # tsvector + structured filter query builder
│   ├── storage.ts                         # Spec sheet + submittal file I/O
│   ├── thumbnails.ts                      # Thumbnail generation
│   ├── categoryLabels.ts                  # Human-readable category label map
│   ├── db.ts                              # Prisma singleton
│   └── types.ts                           # Shared TypeScript types
├── prisma/
│   ├── schema.prisma                      # 8 models, 7 enums
│   ├── seed.ts                            # Seeds manufacturers + root categories
│   └── migrations/
│       └── 001_search_vector_trigger.sql  # tsvector trigger (apply manually after db push)
├── scripts/
│   └── crawl.ts                           # CLI entry point for Playwright crawler
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
- PostgreSQL 14+
- `.env.local`:

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

# Push Prisma schema to database
npx prisma db push

# Apply the tsvector trigger (must be done manually after every db push)
psql $DATABASE_URL < prisma/migrations/001_search_vector_trigger.sql

# Seed manufacturers and root categories
npx prisma db seed

# Run the crawler (Elite Lighting full catalog, ~2–4 hours)
npm run crawl

# Start dev server
npm run dev
```

Open http://localhost:3000.

### Crawler options

```bash
# Crawl specific category families only
npm run crawl -- --categories=FLAT_PANEL,DOWNLIGHT,HIGH_BAY
```

### Useful Prisma commands

```bash
npx prisma db push        # Apply schema changes
npx prisma db seed        # Re-seed manufacturers
npx prisma studio         # Browse data in Prisma Studio GUI
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Used by chat agent (Claude Sonnet) and AI extraction fallback (Claude Haiku) |

---

## Full-Text Search Note

The `searchVector` column is `Unsupported("tsvector")` in the Prisma schema — Prisma does not create or manage it. It is populated by the trigger in `prisma/migrations/001_search_vector_trigger.sql`. If `db push` recreates the `Product` table (schema change), re-apply this migration manually or the search bar will return no results.

---

## Roadmap

| Version | Feature |
|---|---|
| **v2** | Additional manufacturer crawlers (Acuity/Lithonia, Cooper) to expand the product database |
| **v2.5** | pgvector embeddings for semantic similarity search |
| **v3** | Clerk auth, multi-tenant projects, client-facing submittal review portal |
| **Migration** | Move under `/lighting/` in the `atlantiskb-home` monorepo |
