# Full Bug Fix + Agent Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 23 known bugs and sharpen the AI agent into the best commercial lighting expert in Atlanta.

**Architecture:** Three-phase pass — (1) correctness bugs in engine/API, (2) UX error-handling in components, (3) agent intelligence improvements in system prompt and tools. Each task is isolated and independently committable.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, @ai-sdk/anthropic (Claude Sonnet 4.6), pdf-lib, Tailwind CSS 4

---

## PHASE 1 — ENGINE & API BUGS (correctness)

---

### Task 1: Fix division-by-zero in cross-reference range overlap

**Files:**
- Modify: `lib/cross-reference.ts:123-125`

**Problem:** `sourceRange = sHigh - sLow + 1` can equal 1 when min==max (point value), and the division `overlapRange / sourceRange` degenerates when source range is 0 (e.g. a product with lumensMin==lumensMax==0).

**Step 1: Open the file and find `rangeOverlapScore`** (line ~100)

**Step 2: Replace the sourceRange/pctOverlap block**

Old code (lines 122-129):
```typescript
  // Score based on how well they overlap
  const sourceRange = sHigh - sLow + 1
  const overlapRange = overlapHigh - overlapLow
  const pctOverlap = Math.min(1, overlapRange / sourceRange)

  if (pctOverlap >= 0.8) return 1.0
  if (pctOverlap >= 0.5) return 0.7
  return 0.3
```

New code:
```typescript
  // Score based on how well they overlap
  const sourceRange = sHigh - sLow
  if (sourceRange <= 0) return 1.0  // point value — if ranges overlap at all, it's a match
  const overlapRange = overlapHigh - overlapLow
  const pctOverlap = Math.min(1, overlapRange / sourceRange)

  if (pctOverlap >= 0.8) return 1.0
  if (pctOverlap >= 0.5) return 0.7
  return 0.3
```

**Step 3: Commit**
```bash
git add lib/cross-reference.ts
git commit -m "fix: guard division-by-zero in cross-ref range overlap scoring"
```

---

### Task 2: Fix division-by-zero in delta percentage calculations

**Files:**
- Modify: `lib/cross-reference.ts:345-370`

**Problem:** Lines 347 and 365 guard with `if (sLum && tLum)` and `if (sWatt && tWatt)` — this correctly avoids dividing by zero, but the guard uses falsy check which also skips valid 0-value products. Already safe, but the wattage fallback at line 363 `source.wattage ?? source.wattageMax ?? 0` can produce 0 for products with no wattage data, causing the guard to silently skip. No change needed here — already handled correctly.

**Step 1: Fix dimension comparison array-length mismatch** (line 278)

Old code:
```typescript
      const allClose = sDims.length > 0 && sDims.every((d, i) => tDims[i] && Math.abs(d - tDims[i]) / d < 0.1)
```

New code:
```typescript
      const allClose = sDims.length > 0 &&
        sDims.length === tDims.length &&
        sDims.every((d, i) => d > 0 && tDims[i] > 0 && Math.abs(d - tDims[i]) / d < 0.1)
```

**Step 2: Commit**
```bash
git add lib/cross-reference.ts
git commit -m "fix: guard dimension array length mismatch and zero-dimension divide in cross-ref"
```

---

### Task 3: Add file size limit to import-schedule route

**Files:**
- Modify: `app/api/submittals/[id]/import-schedule/route.ts:39`

**Problem:** No file size check — a 200MB PDF would be buffered entirely into memory and sent to the Anthropic API, potentially causing OOM or timeout.

**Step 1: Add size guard after file null check** (after line 39)

Old code:
```typescript
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
```

New code:
```typescript
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
```

**Step 2: Wrap Anthropic call in try-catch** (line 49)

Old code:
```typescript
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
```

New code:
```typescript
  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }] }],
    })
  } catch (err) {
    console.error('[import-schedule] Anthropic API error:', err)
    return NextResponse.json({ error: 'Failed to process document. Please try again.' }, { status: 502 })
  }

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
```

Remove the old inline `const response = await anthropic.messages.create({...})` block and the old `const raw = ...` line since they're now inside/after the try-catch.

**Step 3: Commit**
```bash
git add app/api/submittals/[id]/import-schedule/route.ts
git commit -m "fix: add 20MB file size limit and error handling to import-schedule route"
```

---

### Task 4: Add missing validation to submittal add_item action

**Files:**
- Modify: `app/api/submittals/[id]/route.ts:44-66`

**Problem:** `add_item` has no input validation — missing quantity bounds check, no fixtureType length check. Compare with `update_item` which does validate.

**Step 1: Add validation block** inside the `if (body.action === 'add_item')` branch, before the `prisma.submittalItem.create` call (after line 45):

```typescript
  if (body.action === 'add_item') {
    const { productId, fixtureType, quantity, locationTag, location, mountingHeight, notes, catalogNumberOverride } = body

    // Validate inputs
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (quantity !== undefined) {
      const qty = Number(quantity)
      if (!Number.isInteger(qty) || qty <= 0) {
        return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
      }
    }
    if (fixtureType && fixtureType.length > 50) {
      return NextResponse.json({ error: 'fixtureType too long' }, { status: 400 })
    }
    if (catalogNumberOverride && catalogNumberOverride.length > 200) {
      return NextResponse.json({ error: 'catalogNumberOverride too long' }, { status: 400 })
    }

    const maxOrder = await prisma.submittalItem.findFirst({
```

**Step 2: Commit**
```bash
git add app/api/submittals/[id]/route.ts
git commit -m "fix: add input validation to submittal add_item action"
```

---

### Task 5: Wrap submittal PUT outer fields update in try-catch

**Files:**
- Modify: `app/api/submittals/[id]/route.ts:124-131`

**Problem:** The final `prisma.submittal.update` (line 126) has no error handling — if the submittal ID doesn't exist, Prisma throws a P2025 error that bubbles up as a 500.

**Step 1: Wrap the update**

Old code:
```typescript
  // Update submittal fields
  const { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status } = body
  const updated = await prisma.submittal.update({
    where: { id },
    data: { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status },
  })
  return NextResponse.json(updated)
```

New code:
```typescript
  // Update submittal fields
  const { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status } = body
  try {
    const updated = await prisma.submittal.update({
      where: { id },
      data: { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
  }
```

**Step 2: Commit**
```bash
git add app/api/submittals/[id]/route.ts
git commit -m "fix: return 404 instead of 500 when updating non-existent submittal"
```

---

## PHASE 2 — COMPONENT UX BUGS

---

### Task 6: Add error handling to SubmittalBuilder fetch calls

**Files:**
- Modify: `components/SubmittalBuilder.tsx:76-135`

**Problem:** Three async functions (`handleImport`, `searchProducts`, `addFixture`) have no try-catch — network/API failures leave the UI stuck in a loading state or silently fail.

**Step 1: Add error state at top of component** (after line 51):

```typescript
  const [addError, setAddError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
```

**Step 2: Wrap `handleImport`** (lines 76-89):

```typescript
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/submittals/${submittalId}/import-schedule`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setImportError(json.error ?? 'Import failed'); return }
      setImportResult(json)
      if (json.imported?.length) onRefresh()
    } catch {
      setImportError('Network error — please try again')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }
```

**Step 3: Wrap `searchProducts`** (lines 91-97):

```typescript
  async function searchProducts(q: string) {
    setSearchQuery(q)
    setSearchError(false)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`)
      if (!res.ok) { setSearchError(true); return }
      const json = await res.json()
      setSearchResults(json.data ?? [])
    } catch {
      setSearchError(true)
    }
  }
```

**Step 4: Wrap `addFixture`** (lines 99-135):

```typescript
  async function addFixture() {
    if (!selectedProduct || !fixtureType) return
    setAdding(true)
    setAddError(null)
    try {
      // ... existing resolve logic ...
      const res = await fetch(`/api/submittals/${submittalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ... }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setAddError(json.error ?? 'Failed to add fixture')
        return
      }
      // reset state...
      onRefresh()
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAdding(false)
    }
  }
```

**Step 5: Render errors in JSX** — add below the search/add form area:

```tsx
{searchError && <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>Search failed — please try again</p>}
{addError && <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>{addError}</p>}
{importError && <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>{importError}</p>}
```

**Step 6: Commit**
```bash
git add components/SubmittalBuilder.tsx
git commit -m "fix: add error handling and error states to SubmittalBuilder fetch calls"
```

---

### Task 7: Add search debounce to SubmittalBuilder

**Files:**
- Modify: `components/SubmittalBuilder.tsx`

**Problem:** Every keystroke fires an API call — with no debounce, typing "flat panel" triggers 10 requests. Add 300ms debounce.

**Step 1: Add debounce ref** (after existing refs):

```typescript
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

**Step 2: Replace the `searchProducts` call site** in the input's `onChange` handler — wherever `searchProducts(e.target.value)` is called directly, replace with:

```typescript
onChange={e => {
  const q = e.target.value
  setSearchQuery(q)
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  searchDebounceRef.current = setTimeout(() => searchProducts(q), 300)
}}
```

**Step 3: Remove the `setSearchQuery(q)` from the top of the `searchProducts` function** (it's now set directly in the onChange) — keep everything else.

**Step 4: Commit**
```bash
git add components/SubmittalBuilder.tsx
git commit -m "fix: debounce product search in SubmittalBuilder (300ms)"
```

---

### Task 8: Fix silent save failure in ChatInterface

**Files:**
- Modify: `components/ChatInterface.tsx`

**Problem:** The `saveToDb` function swallows errors silently. If chat saving fails, the user doesn't know their conversation wasn't persisted.

**Step 1: Read the file to find the exact saveToDb function**
```bash
grep -n "saveToDb\|isSavingRef\|fetch.*chats" components/ChatInterface.tsx | head -20
```

**Step 2: Add error handling** — find the `fetch` call inside `saveToDb` and wrap it:

```typescript
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      if (!res.ok) console.warn('[ChatInterface] Failed to save chat:', res.status)
    } catch (err) {
      console.warn('[ChatInterface] Network error saving chat:', err)
    } finally {
      isSavingRef.current = false
    }
```

**Step 3: Commit**
```bash
git add components/ChatInterface.tsx
git commit -m "fix: log errors when chat save to DB fails instead of swallowing silently"
```

---

## PHASE 3 — AGENT INTELLIGENCE

---

### Task 9: Sharpen system prompt — fix 6 gaps

**Files:**
- Modify: `lib/agent/system-prompt.ts`

**Problems to fix in one pass:**
1. No guidance on how to handle "show me X products" vs "what do you have for X" ambiguity
2. No instructions for when 0 or 1 results come back from a tool
3. Advisory mode has no rule about manufacturer-specific requests (user names brand + type = PRODUCT_SEARCH, not ADVISORY)
4. Missing: what to do when the user asks a follow-up like "what about Cooper?" after seeing results
5. Missing: how to handle "add all of these to my submittal" (multi-add pattern)
6. Section 3 (Advisory) doesn't instruct Claude to mention if data is limited

**Step 1: Add to Section 1 TIE-BREAK RULES** (after line 82 "If still ambiguous, prefer ADVISORY over PRODUCT_SEARCH"):

```
- If user names a specific manufacturer AND a specific product type/form factor → PRODUCT_SEARCH (e.g. "show me elite flat panels", "acuity high bays", "i need a cooper wall pack")
- If user says "what about [manufacturer]?" as a follow-up → CROSS_REFERENCE using the product from prior turn as source
```

**Step 2: Add to Section 3 ADVISORY MODE** (after step D "Call recommend_fixtures"):

```
E. If recommend_fixtures returns only 1–2 results, say so and explain why (narrow filter, limited catalog coverage) — do NOT call the tool again.
F. If limited spec data is noted on results (fitConfidence < 0.6), explicitly caveat: "spec data for this product is incomplete — verify wattage/lumens before specifying."
```

**Step 3: Add multi-add pattern to Section 6 SUBMITTAL MODE**:

```
Multi-add: If the user says "add all of these" or "add both" after seeing recommendations, call add_to_submittal for each product separately using sequential tool calls. Auto-assign fixture types (A, B, C). Confirm with: "Added [n] fixtures to the submittal: Type A = [catalog], Type B = [catalog]."
```

**Step 4: Add follow-up handling to Section 14 TOOL DISCIPLINE**:

```
- In ADVISORY follow-ups ("what about Cooper?", "any options from Acuity?"), do NOT start a new advisory search — call recommend_fixtures with manufacturerSlug set to the named brand, using the same fixtureType and applicationType from the prior turn.
- NEVER apologize for limited results. State what was found and why the pool is narrow.
```

**Step 5: Commit**
```bash
git add lib/agent/system-prompt.ts
git commit -m "feat: sharpen system prompt — manufacturer tie-break, limited results handling, multi-add, follow-up patterns"
```

---

### Task 10: Improve recommend_fixtures — better candidate pool and scoring

**Files:**
- Modify: `lib/agent/tools.ts:492-515` (recommend_fixtures execute)
- Modify: `lib/agent/recommend.ts:225-232` (whyRecommended string)

**Problems:**
1. The initial candidate search uses `environment: ctx.indoorPreferred ? 'indoor' : 'outdoor'` which excludes products with `environment: BOTH` — a huge portion of the catalog. Should use OR logic.
2. The `whyRecommended` string uses "general" as the application label when `applicationType` is "general" — reads oddly in UI. Should humanize.
3. When `evaluatedCount` is 0, the tool returns an error — should retry without environment filter first.

**Step 1: Fix environment filter in candidate search** (`lib/agent/tools.ts` ~line 492):

Old code:
```typescript
      let candidates = await searchProducts({
        fixtureType: params.fixtureType,
        environment: ctx.indoorPreferred ? 'indoor' : 'outdoor',
        minCri: ctx.minCri > 5 ? ctx.minCri - 5 : undefined,
```

New code:
```typescript
      let candidates = await searchProducts({
        fixtureType: params.fixtureType,
        // Don't filter by environment — 'BOTH' products should always be candidates
        // environment filter was excluding too many valid indoor/both-rated products
        minCri: ctx.minCri > 5 ? ctx.minCri - 5 : undefined,
```

**Step 2: Humanize "general" application label** (`lib/agent/recommend.ts` ~line 225):

Find the `whyRecommended` construction in `scoreCandidate` and the `enrichWithComparativeRationale` function. In `enrichWithComparativeRationale`, add a label mapping:

```typescript
  const appLabel = ctx.applicationType === 'general'
    ? 'this application'
    : ctx.applicationType
```

**Step 3: Commit**
```bash
git add lib/agent/tools.ts lib/agent/recommend.ts
git commit -m "fix: remove environment over-filter in recommend_fixtures, humanize 'general' label"
```

---

### Task 11: Add "what competitors have" advisory capability to system prompt

**Files:**
- Modify: `lib/agent/system-prompt.ts`

**Problem:** When a rep is spec'd against (e.g. "the spec calls for Lithonia CPX — can we offer something competitive?"), the agent has no guidance for this pattern. It should recognize it as a CROSS_REFERENCE request and run cross_reference with the named product.

**Step 1: Add to Section 4 CROSS_REFERENCE MODE** (after step A):

```
Competitive substitution pattern: If the user says "the spec calls for X" or "they specified X" or "can we compete with X", treat this as CROSS_REFERENCE where X is the source fixture and your catalog is the target. The goal is to find a substitute your company can supply.
```

**Step 2: Add to Section 7 MANUFACTURER MAPPING**:

```
When the user says "we" or "our line" or "what do we have", they are asking about products you can supply — use all manufacturers in the catalog (elite, acuity, cooper, current, lutron) unless they specify one.
```

**Step 3: Commit**
```bash
git add lib/agent/system-prompt.ts
git commit -m "feat: add competitive substitution and 'our line' patterns to system prompt"
```

---

### Task 12: Improve cross-reference result quality — AI post-filter prompt

**Files:**
- Modify: `lib/cross-reference.ts` (AI post-filter section, ~line 450+)

**Problem:** The AI sanity check prompt is minimal — it just asks "does this make sense?" without giving Claude the fixture context needed to make good decisions. Improve the prompt to include key specs.

**Step 1: Find the AI post-filter call** — search for `claude-haiku` or the AI sanity check in cross-reference.ts:
```bash
grep -n "haiku\|sanity\|post.filter\|anthropic" lib/cross-reference.ts | head -20
```

**Step 2: Enhance the prompt** to include explicit spec comparison:
- Pass source wattage, lumens, CRI, CCT, environment
- Ask Claude to rate each candidate as KEEP/REJECT with a one-line reason
- Parse response more robustly (look for KEEP/REJECT keywords)

**Step 3: Commit**
```bash
git add lib/cross-reference.ts
git commit -m "feat: improve AI post-filter prompt in cross-reference with explicit spec context"
```

---

### Task 13: Expand fixture class signals for better advisory filtering

**Files:**
- Modify: `lib/agent/recommend.ts:246-281` (FIXTURE_CLASS_SIGNALS)

**Problem:** DOWNLIGHT, SURFACE_MOUNT, WRAP, CANOPY, AREA_SITE, and VAPOR_TIGHT have no signals defined — the inference always returns 'unknown', so every product in the DB gets a small score penalty. Expand coverage.

**Step 1: Add missing fixture class signals** after the existing `VAPOR_TIGHT` entry:

```typescript
  DOWNLIGHT: {
    positive: [
      'downlight', 'down light', 'recessed', 'wafer', 'slim', 'pancake',
      'pot light', 'can light', 'ic-rated', 'ic rated',
    ],
    negative: ['troffer', 'high bay', 'strip', 'flat panel', 'wall pack'],
  },
  CANOPY: {
    positive: ['canopy', 'gas station', 'fueling station', 'covered walkway'],
    negative: ['troffer', 'high bay', 'wall pack', 'flat panel'],
  },
  AREA_SITE: {
    positive: ['area light', 'site light', 'shoe box', 'shoebox', 'parking lot', 'area/site'],
    negative: ['troffer', 'high bay', 'wall pack', 'canopy'],
  },
  WRAP: {
    positive: ['wrap', 'wraparound', 'wrap-around', 'shop light'],
    negative: ['troffer', 'high bay', 'flat panel', 'strip'],
  },
  SURFACE_MOUNT: {
    positive: ['surface mount', 'surface-mount', 'j-box', 'jbox', 'flush mount'],
    negative: ['troffer', 'high bay', 'wall pack', 'pendant', 'recessed'],
  },
  WALL_MOUNT: {
    positive: ['wall mount', 'sconce', 'wall-mount', 'wall mounted'],
    negative: ['troffer', 'high bay', 'wall pack', 'canopy'],
  },
```

**Step 2: Commit**
```bash
git add lib/agent/recommend.ts
git commit -m "feat: expand fixture class signals for downlight, canopy, area, wrap, surface-mount, wall-mount"
```

---

### Task 14: Add application type aliases to recommendation context

**Files:**
- Modify: `lib/agent/recommend.ts:58-68` (APPLICATION_DEFAULTS)

**Problem:** Common application descriptions are missing aliases — a rep saying "parking garage", "manufacturing floor", "grocery store", "hotel lobby", or "break room" gets defaulted to 'default' profile, losing all inferred CCT/CRI/DLC preferences.

**Step 1: Add missing profiles** after the existing entries:

```typescript
  parking_garage:     { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
  parking_lot:        { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
  garage:             { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
  manufacturing:      { projectPosture: 'standard_commercial', preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  industrial:         { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  gym:                { projectPosture: 'standard_commercial', preferredCCTs: [4000, 5000], minCri: 80,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  fitness:            { projectPosture: 'standard_commercial', preferredCCTs: [4000, 5000], minCri: 80,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  hotel:              { projectPosture: 'premium_design',      preferredCCTs: [3000, 2700], minCri: 90,  dlcPreferred: false, dimmingPreferred: true,  indoorPreferred: true  },
  hospitality:        { projectPosture: 'premium_design',      preferredCCTs: [3000, 2700], minCri: 90,  dlcPreferred: false, dimmingPreferred: true,  indoorPreferred: true  },
  restaurant:         { projectPosture: 'premium_design',      preferredCCTs: [3000, 2700], minCri: 90,  dlcPreferred: false, dimmingPreferred: true,  indoorPreferred: true  },
  grocery:            { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 90,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  supermarket:        { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 90,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  break_room:         { projectPosture: 'value_engineered',    preferredCCTs: [3500, 4000], minCri: 80,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  corridor:           { projectPosture: 'value_engineered',    preferredCCTs: [3500, 4000], minCri: 80,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  hallway:            { projectPosture: 'value_engineered',    preferredCCTs: [3500, 4000], minCri: 80,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  stairwell:          { projectPosture: 'value_engineered',    preferredCCTs: [4000, 5000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true  },
  loading_dock:       { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
  exterior:           { projectPosture: 'standard_commercial', preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
  outdoor:            { projectPosture: 'standard_commercial', preferredCCTs: [5000, 4000], minCri: 70,  dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: false },
```

**Step 2: Commit**
```bash
git add lib/agent/recommend.ts
git commit -m "feat: add 20 application type profiles to recommendation context (parking, manufacturing, gym, hotel, etc.)"
```

---

### Task 15: Add application type aliases to system prompt fixture mapping

**Files:**
- Modify: `lib/agent/system-prompt.ts`

**Problem:** Section 3 lists only 8 application→fixture mappings. The new application profiles need corresponding fixture class inference guidance for the agent.

**Step 1: Expand Section 3A "Infer the most likely fixture class"**

Add after the existing examples:
```
- parking garage / covered parking → CANOPY or GARAGE
- parking lot / exterior area / site → AREA_SITE
- loading dock / outdoor storage → FLOOD or WALL_PACK
- stairwell / corridor / hallway → WALL_MOUNT or SURFACE_MOUNT
- break room / restroom / utility → WRAP or SURFACE_MOUNT
- gym / fitness center → HIGH_BAY or LINEAR_SUSPENDED (depends on ceiling height — ask if unclear)
- restaurant / hotel lobby / hospitality → DOWNLIGHT or PENDANT (premium, dimmable)
- grocery / supermarket → LINEAR_SUSPENDED or TROFFER (high CRI, 3500K–4000K)
- manufacturing / industrial plant → HIGH_BAY (check voltage — may be 480V)
```

**Step 2: Add explicit voltage reminder for industrial**

Add to Section 9 HARD TECHNICAL RULES:
```
Industrial/manufacturing facilities: Always ask about voltage before recommending. 480V is common and requires specific driver/transformer arrangements. A 120-277V fixture cannot run on 480V.
```

**Step 3: Commit**
```bash
git add lib/agent/system-prompt.ts
git commit -m "feat: expand application→fixture mapping and add industrial voltage reminder to system prompt"
```

---

### Task 16: Improve agent response quality — anti-repetition and ranking context

**Files:**
- Modify: `lib/agent/system-prompt.ts`

**Problem:** The agent sometimes restates what's already visible in product cards (catalog number, lumens, wattage) — wasted tokens that push the actual judgment below the fold. It also doesn't explain the ranking context unless asked.

**Step 1: Strengthen Section 13 OUTPUT STYLE**:

Add after "Do not repeat what product cards already show":
```
- Cards already show: catalog number, manufacturer, lumens, wattage, CRI, CCT, voltage, DLC status. Never restate these.
- Your job is the judgment layer: why this fixture wins for THIS application, what would disqualify it, and what the rep should watch out for.
- Format ADVISORY responses as:
  1. One-sentence verdict (e.g. "The CPXS is your best bet here — DLC Premium, selectable CCT, and the right output range for a classroom grid.")
  2. One tradeoff or caveat if material
  3. One-sentence on the alternative only if it's meaningfully different
- Total response should be 3–5 sentences. Not a list. Not a paragraph per product.
```

**Step 2: Commit**
```bash
git add lib/agent/system-prompt.ts
git commit -m "feat: tighten advisory response format — verdict first, no card restating, 3-5 sentence target"
```

---

## PHASE 4 — FINAL VERIFICATION

### Task 17: End-to-end smoke test

**Test all three primary flows in the browser:**

1. **Advisory** — "what's a good high bay for a manufacturing floor at 277V?"
   - Expected: `recommend_fixtures` called once, 1–3 cards, no duplicates, voltage context mentioned

2. **Product search with manufacturer** — "show me acuity high bays"
   - Expected: `search_products` called, results shown, no advisory mode triggered

3. **Cross-reference** — "cross the Lithonia CPX 2x4 to Elite"
   - Expected: `search_products` → `cross_reference` (2 steps), comparison shown with spec deltas

4. **Submittal add** — after advisory result, "add the top pick to my submittal"
   - Expected: `add_to_submittal` called, "Added X as Type A" confirmation

5. **Import schedule** — upload a >20MB file to import-schedule
   - Expected: 413 response, error shown in UI

**Commit after all pass:**
```bash
git add .
git commit -m "test: all primary flows verified post-bugfix + agent quality pass"
```

---

## Summary

| Phase | Tasks | Key Outcomes |
|-------|-------|-------------|
| 1 — Engine/API | 1–5 | No division-by-zero, proper 4xx responses, file size limit |
| 2 — Components | 6–8 | Error states shown, no stuck loading spinners, debounced search |
| 3 — Agent | 9–16 | Better advisory, 20 new app profiles, expanded fixture signals, cleaner responses |
| 4 — Verify | 17 | All flows green |
