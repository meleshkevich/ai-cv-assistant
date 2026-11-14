# Architecture — AI Job Assistant

## Extension components

```
┌─────────────────────────────────────────────────────┐
│  Chrome Browser                                      │
│                                                      │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │  Background      │   │  Side Panel             │  │
│  │  Service Worker  │   │  (sidepanel.html)       │  │
│  │                  │   │                         │  │
│  │  • setPanelBehav │   │  Vue 3 app              │  │
│  │    ior() on      │   │  ┌──────────────────┐   │  │
│  │    install       │   │  │ App.vue          │   │  │
│  │                  │   │  │ ├─ Nav (tabs)    │   │  │
│  │  Dormant unless  │   │  │ ├─ ScanView      │   │  │
│  │  panel lifecycle │   │  │ │  └─JobResultDisplay│ │  │
│  │  events fire     │   │  │ └─ ProfileView   │   │  │
│  └──────────────────┘   │  │    ├─PersonalSection│ │  │
│                         │  │    ├─ExperienceSection│ │  │
│  chrome.storage.local   │  │    ├─ProjectsSection│ │  │
│  ┌──────────────────┐   │  │    ├─EducationSection│ │  │
│  │ masterProfile    │◄──┼──┤    ├─LanguagesSection│ │  │
│  │ (MasterProfile)  │   │  │    └─GeneralNotesSection│ │  │
│  └──────────────────┘   │  └──────────────────┘   │  │
│                         │                          │  │
│                         │  Services                │  │
│                         │  tabService.ts           │  │
│                         │  profileService.ts       │  │
│                         └────────────────────────┘  │
│                                   │                  │
│                                   │ scripting        │
│                                   ▼ executeScript    │
│                         ┌────────────────────────┐  │
│                         │  Target Web Page        │  │
│                         │  (injected functions)   │  │
│                         │  extractPageData()      │  │
│                         │  extractJobData()       │  │
│                         └────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Communication flow — Scan (job extraction)

1. User clicks the extension toolbar icon.
2. Chrome fires the action click; `setPanelBehavior({ openPanelOnActionClick: true })` (set at install) causes Chrome to open the side panel automatically.
3. Side panel loads `sidepanel.html` → Vue app boots → `ScanView` mounts.
4. On mount, `ScanView` calls `chrome.tabs.query` to display the active tab URL.
5. User clicks **Scan for Job**.
6. `tabService.getActiveTab()` queries the active tab.
7. `tabService.extractJobFromTab()` calls `chrome.scripting.executeScript` with `func: extractJobData`.
8. Chrome injects and runs `extractJobData` inside the page's context.
9. Stage A: The function parses `<script type="application/ld+json">` tags looking for `@type: "JobPosting"`. Handles top-level arrays and `@graph`. Strips HTML tags from description. Never executes extracted scripts.
10. Stage B: If JSON-LD extraction fails, DOM heuristics score candidate elements (by id/class patterns, `itemtype`, tag name, text length). The best candidate is cloned, junk (nav, footer, cookie banners) is removed, and `innerText` is extracted.
11. Stage C: The description textarea in `JobResultDisplay` is always editable. If confidence is low or extraction failed, the user can paste or correct the text.
12. Result is returned as `JobExtractionResult` with `extractionMethod`, `confidence`, and optional `jobTitle`, `company`, `location`.
13. `ScanView` updates job state → `JobResultDisplay` renders structured metadata and an editable description.

## Communication flow — AI Analysis

1. After a successful scan (or manual entry), the **AI Analysis** section appears in `ScanView`.
2. On first use, a privacy consent notice is shown; the user must acknowledge before any data is sent.
3. User clicks **Analyze with AI**; `ScanView` creates an `AbortController` and an `analysisSeq` guard (same pattern as `querySeq`).
4. `analyzeJob()` in `jobAnalysisService.ts` orchestrates the pipeline:
   - Validates: API key non-empty, job description non-empty, profile non-empty.
   - Builds the request: `buildSystemPrompt()` + `buildUserMessage()` from `src/prompts/analyzeJob.ts`.
   - Experience and project entries are prefixed with `[EXP-ID: …]` / `[PROJ-ID: …]` tags so the model can cite them exactly.
   - Calls `callResponsesAPI()` → `POST https://api.openai.com/v1/responses` with `text.format.type = "json_schema"` and `store: false`.
5. The raw JSON text is parsed → `parseAndValidateAnalysis()` checks structural shape → `verifyAnalysis()` cross-references source IDs against the actual profile.
6. `ScanView` checks `seq !== analysisSeq` before applying the result — stale results from aborted analyses are discarded.
7. `JobAnalysisResult.vue` renders the validated analysis (plain text only, no `v-html`).

## Communication flow — Profile

1. `App.vue` calls `useProfile()` on mount; the composable is provided at the root via `provide(PROFILE_KEY, composable)`.
2. `loadProfile()` reads `chrome.storage.local` → deserializes `MasterProfile`.
3. Section components (`PersonalSection`, `ExperienceSection`, etc.) inject `PROFILE_KEY` and mutate `profile.value.*` directly.
4. A deep `watch` on `profile` debounces writes (600 ms).
5. Structural edits (Add/Delete) call `forceSave()` immediately via `inject(PROFILE_KEY)`, bypassing the debounce.
6. `save()` enqueues writes on a serializing `writeChain` promise so concurrent saves cannot race. Within the chain, the `saveSeq` check ensures only the latest enqueued save actually writes — earlier ones skip if superseded.
7. `saveProfile()` serialises the reactive profile through a JSON round-trip before passing the value to `chrome.storage.local.set()` — see _Profile serialization_ below.

## Profile serialization

### Why a JSON round-trip is required

Vue 3's reactive state uses ES6 `Proxy` objects. `profile.value` and all nested arrays (`experience`, `projects`, etc.) are `Proxy`-wrapped.

Chrome's extension storage API serialises values via its C++ V8 value converter (`FromV8Value`). The converter calls `val->IsArray()` to decide whether to encode a value as a JSON array or a JSON object. `v8::Value::IsArray()` checks the **C++ heap type** of the value — it returns `false` for Proxy objects because a Proxy is not a `JSArray` at the C++ level, even when it wraps an Array.

As a result, without the round-trip fix:
- `experience: [{ id: 'exp-1', … }]` → stored as `experience: {}`
- `generalNotes: 'some text'` → stored correctly (strings are not affected)

The fix in `saveProfile()`:
```typescript
const plain = JSON.parse(JSON.stringify(profile)) as MasterProfile
await chrome.storage.local.set({ [STORAGE_KEY]: plain })
```

`JSON.stringify` in JavaScript uses the ECMAScript `IsArray` abstract operation, which **does** handle Proxy objects correctly (it recursively calls `[[IsArray]]` on the Proxy target). The resulting JSON string is then parsed back into a plain JavaScript object — no Proxies — which Chrome's C++ converter handles without issue.

### Persistence lifecycle

```
Vue Reactive Profile (profile.value — Proxy-wrapped)
          │
          │ forceSave() / debounce fires / pagehide
          ▼
        save() — increments saveSeq, enqueues in writeChain
          │
          │ writeChain (.then chain, serialized)
          ▼
   saveSeq check — skip if superseded by a later save
          │
          ▼
     saveProfile(profile.value)
          │
          │ JSON.parse(JSON.stringify(profile))
          ▼
     plain MasterProfile object (no Proxy)
          │
          │ validateSnapshot() — dev-only: logs if arrays missing
          ▼
  chrome.storage.local.set({ masterProfile: plain })
          │
          ▼
       chrome.storage.local
```

### Save ordering

The `writeChain` is a serializing Promise chain. Each `save()` call appends a `.then()` to the tail. Within each chain segment, the `saveSeq` guard skips writes that have been superseded:

```typescript
if (seq !== saveSeq) return  // a newer save is queued — skip this one
await saveProfile(profile.value)  // profile.value read at execute time (latest state)
```

Because `profile.value` is read at **execute time** (not at enqueue time), the last committed write always reflects the most recent reactive state.

### Validation

`validateSnapshot()` (dev-only) logs a warning before writing if any array field is not a real `Array`. This is a diagnostic guard, not an error block — the write still proceeds. The corruption that the original bug caused (`{}`) would have been caught by this guard.

### Corrupted-data recovery

`loadProfile()` distinguishes between:

| Stored value | Meaning | Action |
|---|---|---|
| `undefined` / `null` | Field was never set | Normalize to `[]`, `corrupted: false` |
| `[]` or `[{…}]` | Valid array | Use as-is, `corrupted: false` |
| `{}` / number / string | Corruption | Normalize to `[]` in memory, `corrupted: true` |

When `corrupted: true` is returned, the composable sets `profileCorrupted.value = true`. `ProfileView.vue` renders a dismissible error banner naming the affected fields and directing the user to use **Import JSON** with a previous export to recover their data.

**The original experience entries that were stored as `{}` are unrecoverable from storage.** Only a valid JSON export made before the corruption occurred can restore them.

### pagehide behaviour and known limitations

`handlePageHide` calls `save()` (not `saveProfile()` directly), keeping all writes on the `writeChain`. This prevents bypassed writes from racing with in-flight writeChain saves.

**Known limitation:** if the writeChain still has unprocessed entries when the renderer is torn down, the pagehide-enqueued save may not reach `chrome.storage.local.set()` in time. In practice this window is tiny — the writeChain processes each segment synchronously (microtasks, no I/O between entries). The main mitigation is that structural edits (Add/Delete) always call `forceSave()` immediately, leaving the writeChain idle long before the user has a chance to close the panel.

## Job extraction pipeline

```
extractJobData() [page context, self-contained]
│
├── Stage A: JSON-LD
│   ├── querySelectorAll('script[type="application/ld+json"]')
│   ├── JSON.parse each (skips malformed)
│   ├── Flatten top-level arrays and @graph arrays
│   ├── Find first item with @type === "JobPosting"
│   ├── Strip HTML tags from description (regex, never innerHTML)
│   └── Return: { extractionMethod: 'json-ld', confidence: 'high'|'medium', … }
│
└── Stage B: DOM Heuristics
    ├── Score candidate elements (main, article, div, section with id/class)
    │   ├── +15 if id/class matches job-desc, vacancy, popis-prace, etc.
    │   ├── +20 if itemtype contains "JobPosting"
    │   ├── +3 for ARTICLE, +2 for MAIN
    │   └── +2/+3 for text length >300/>1000 chars
    ├── Clone the best-scoring element (threshold score > 5)
    ├── Remove: script, style, noscript, nav, header, footer, aside, iframe
    ├── Remove: elements whose id/class matches cookie, banner, sidebar, modal, etc.
    ├── Extract innerText and normalise whitespace
    └── Return: { extractionMethod: 'dom', confidence: 'medium'|'low', … }
```

## Stale result prevention

Both tab queries and job extractions share the `querySeq` counter in `ScanView`:

```
const seq = ++querySeq
const result = await slowOperation()
if (seq !== querySeq) return   // ← stale: a newer operation already updated state
applyResult(result)
```

When the user switches tabs during an in-flight extraction, `refreshTabState()` increments `querySeq`. The extraction's check `seq !== querySeq` detects the stale state and discards the result.

## Profile data model

```typescript
MasterProfile {
  schemaVersion: 1
  personal: PersonalInfo          // 7 fields: fullName, title, location, email, phone, linkedIn, github
  experience: ExperienceEntry[]   // id, company, position, location, startDate, endDate|null, description
  projects: ProjectEntry[]        // id, name, role, url, startDate, endDate|null, description
  education: EducationEntry[]     // id, institution, degree, field, startDate, endDate|null, description
  languages: LanguageEntry[]      // id, language, proficiency
  generalNotes: string            // unrestricted free text
}
```

`endDate: null` = current/ongoing (present) across all entry types (experience, projects, education).
`endDate: ''` = blank (user has not entered a date yet).
`endDate: 'YYYY-MM'` = specific end date.

Stored under the `masterProfile` key in `chrome.storage.local`.

## Chrome permissions

| Permission | Why |
|---|---|
| `activeTab` | Grants temporary scripting access to the active tab on user action |
| `scripting` | Allows `chrome.scripting.executeScript` to inject `extractJobData` and `extractPageData` |
| `sidePanel` | Enables the Chrome Side Panel API |
| `storage` | `chrome.storage.local` for profile and settings persistence |
| `tabs` | Required for `tab.url` to be populated in `chrome.tabs.query()` results |
| `host_permissions: https://api.openai.com/*` | Required for `fetch()` to reach the OpenAI Responses API |
| `optional_host_permissions: *://*/*` | Per-site opt-in via `chrome.permissions.request()` |

## Source layout

```
src/
├── background/
│   └── index.ts              # Service worker — panel behaviour only
├── composables/
│   ├── useProfile.ts         # Profile state: load, debounced autosave, writeChain serialization
│   └── useSettings.ts        # Settings state: load, save, removeKey, acknowledgePrivacy
├── content/
│   ├── extractor.ts          # extractPageData() — raw page text (legacy)
│   └── jobExtractor.ts       # extractJobData() — 5-stage job extraction (self-contained)
├── prompts/
│   └── analyzeJob.ts         # JOB_ANALYSIS_SCHEMA, buildSystemPrompt(), buildUserMessage()
├── services/
│   ├── tabService.ts         # Chrome API calls: tab query + script injection
│   ├── profileService.ts     # chrome.storage.local read/write for MasterProfile
│   ├── settingsService.ts    # chrome.storage.local read/write for ExtensionSettings
│   ├── openaiService.ts      # callResponsesAPI(), extractOutputText(), error mapping
│   └── jobAnalysisService.ts # analyzeJob() pipeline: validate → build → call → parse → verify
├── types/
│   ├── index.ts              # Shared interfaces: ExtractionResult, ScanState, …
│   ├── job.ts                # JobExtractionResult, JobScanState
│   ├── profile.ts            # MasterProfile and all sub-interfaces
│   ├── settings.ts           # ExtensionSettings, DEFAULT_OPENAI_MODEL, createDefaultSettings()
│   └── jobAnalysis.ts        # JobAnalysis, ValidatedAnalysis, VerificationIssue, AnalysisErrorCode
├── utils/
│   ├── pageUtils.ts          # Pure formatting helpers
│   ├── profileValidation.ts  # JSON import validation
│   ├── jobLdParser.ts        # Pure JSON-LD parsing (testable in Node)
│   ├── jobDomExtractor.ts    # DOM heuristics utility (testable with jsdom)
│   ├── jobSiteRegistry.ts    # Site-specific selector configs (jobs.cz, linkedin.com)
│   └── jobAnalysisValidator.ts # parseAndValidateAnalysis(), verifyAnalysis(), groupMatchesByStatus()
└── sidepanel/
    ├── main.ts               # Vue app entry
    ├── App.vue               # Root layout + tab navigation + profile/settings provide
    ├── views/
    │   ├── ScanView.vue      # Scan: extraction, AI analysis, privacy consent, stale guards
    │   ├── ProfileView.vue   # Profile editor: sections, import/export, save status
    │   └── SettingsView.vue  # API key (password field), model, save/remove key
    └── components/
        ├── ResultDisplay.vue       # Legacy raw-text result view (kept for reference)
        ├── JobResultDisplay.vue    # Job extraction result: metadata + editable textarea
        ├── JobAnalysisResult.vue   # AI analysis: overview, match bar, evidence, recommendations
        ├── MatchCard.vue           # Individual match with evidence items
        └── profile/
            ├── PersonalSection.vue    # 7-field personal info form
            ├── ExperienceSection.vue  # Collapsible experience list + inline forms
            ├── ProjectsSection.vue    # Collapsible projects list + inline forms
            ├── EducationSection.vue   # Education list + "Currently enrolled" toggle
            ├── LanguagesSection.vue   # Language/proficiency pairs
            └── GeneralNotesSection.vue # Unrestricted free-text textarea
```

## Tests

```
tests/
├── setup.ts                           # Chrome API mock (storage.local)
├── profile/
│   ├── profileModel.test.ts           # createEmptyProfile, generateId, isProfileEmpty, serialization
│   ├── profileValidation.test.ts      # validateProfileJson — valid + invalid input coverage
│   └── profileService.test.ts         # loadProfile, saveProfile, stale-write pattern
└── job/
    ├── jobLdParser.test.ts            # JSON-LD parsing: basic, @graph, arrays, HTML strip, Czech
    ├── jobDomExtractor.test.ts        # DOM heuristics (jsdom): job class names, Czech, junk removal
    ├── jobSiteRegistry.test.ts        # Domain matching, subdomain handling
    ├── siteSpecificExtractor.test.ts  # Site-specific selector extraction
    ├── staleResult.test.ts            # querySeq / analysisSeq stale prevention pattern
    └── jobAnalysis.test.ts            # analyzeJob: input validation, HTTP errors, parsing, schema,
                                       # verifyAnalysis: source ID verification, duplicate IDs,
                                       # buildUserMessage: ID tags, XML wrapping, Czech Unicode
```

Run with: `npm test`

## Build output (dist/)

```
dist/
├── manifest.json             # Copied from public/
├── icons/                    # Copied from public/icons/
├── background.js             # Bundled service worker (stable filename)
├── sidepanel.html            # Processed HTML with updated asset refs
└── assets/
    ├── sidepanel-[hash].js   # Vue bundle (includes extractJobData inlined)
    └── sidepanel-[hash].css  # Extracted styles
```

## Current implementation scope (v0.4.0)

- [x] Side panel opens on toolbar icon click
- [x] Tab navigation: Scan / My Profile / Settings
- [x] Active tab URL displayed on panel load
- [x] "Scan for Job" — Stage A: site-specific selectors (jobs.cz, linkedin.com)
- [x] "Scan for Job" — Stage B: JSON-LD JobPosting extraction
- [x] "Scan for Job" — Stage C: generic DOM heuristics with ancestor preference
- [x] "Scan for Job" — Stage D/E: body fallback
- [x] LinkedIn truncation detection warning
- [x] Job title, company, location displayed when available
- [x] Extraction method and confidence badge
- [x] Manual input fallback ("Enter job description manually →")
- [x] Per-site optional host permissions via `chrome.permissions.request()`
- [x] Auto-refresh on tab switch / navigation
- [x] Stale async result prevention (querySeq + analysisSeq counters, writeChain serialization)
- [x] Graceful error handling for restricted pages
- [x] Master Profile editor — all sections editable
- [x] endDate consistently normalized: null = current/ongoing, '' = blank, 'YYYY-MM' = date
- [x] Autosave with 600 ms debounce + writeChain serialization (no concurrent write races)
- [x] Explicit save status indicator (Saving / Saved / Error)
- [x] JSON export
- [x] JSON import with validation and confirmation
- [x] Settings view: OpenAI API key (password field, show/hide), model, two-step key removal
- [x] "Analyze with AI" button — privacy consent on first use
- [x] OpenAI Responses API integration (`POST /v1/responses`, `text.format.type: "json_schema"`, `store: false`)
- [x] Evidence-based structured analysis: supported / partial / unsupported per requirement
- [x] Application-side verification of AI-returned source IDs
- [x] AbortController cancellation for in-flight analysis requests
- [x] Analysis result display: match bar, evidence cards, relevant experience, recommendations

## Planned future modules

| Module | Description |
|---|---|
| Cover Letter generator | Template + AI content assembly |
| CV generator | One-page ATS-friendly CV assembly |
| PDF export | pdfmake-based export of generated documents |
