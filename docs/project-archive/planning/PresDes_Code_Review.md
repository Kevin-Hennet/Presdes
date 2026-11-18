# PresDes / LabelLens code review

Reviewed November 14, 2026. Repository: Kevin-Hennet/labellens-2. Snapshot: `f41f3a0f1e03663aed531074bd55d813920bf63f` on master.

**Overall assessment:** A useful hackathon prototype with a coherent frontend/backend structure, but the committed version has two reproducible build/startup blockers and significant data-isolation, state-management, and reliability problems. Fix the core flow before adding features. The implementation remains a broad LabelLens document app; it does not yet match the narrower PresDes overview.

## Scope and verification

Retrieved all 49 tracked files through the GitHub connection. Reviewed all application source, styles, configuration, deployment files, README, example environment files, and dependency manifests; inspected the generated lockfile's dependency metadata. No AGENTS.md was present in this snapshot.

Created a separate local snapshot for checks. No GitHub files were changed, committed, or pushed.

- Installed frontend dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, then ran `npm run build`: failed with TS2322 at Scan.tsx line 5.
- Created a fresh Python 3.11 environment and installed the exact backend requirements: importing app.main failed with ModuleNotFoundError for openai.
- Ran offline endpoint checks with a stubbed AI client and mocked database I/O. Used the installed PyMongo insert method with its network-writing method mocked to reproduce its mutation of the inserted document.
- Reproduced HTTP 500 on dose logging after insertion, HTTP 500 on a successful analysis followed by a database failure, acceptance of malformed AI response structures, removal of a malformed uncertainty field, and an unauthenticated medication-list response.
- Did not use real patient documents, call an AI service, connect to a live database, inspect a deployed site, or test a real phone/screen reader.
- Runtime concurrency timing was inconclusive in this environment; the concurrency finding below is based on source inspection.
- This is not a clinical accuracy assessment or a dependency vulnerability audit.

## Highest-priority findings

### 1. Frontend production build fails — P1, reproduced

[Scan.tsx:5](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/Scan.tsx#L5)

`u.lang = language === 'English' ? 'en-US' : undefined` assigns undefined to a DOM property typed as string. Strict TypeScript rejects it, and the build script runs TypeScript before Vite. The Docker frontend build uses that same script.

Use an explicit language-code mapping with a string fallback. For example:

```ts
const speechLanguages: Record<string, string> = {
  English: 'en-US', Spanish: 'es-ES', Hindi: 'hi-IN',
  French: 'fr-FR', Portuguese: 'pt-PT',
  Chinese: 'zh-CN', Arabic: 'ar',
};
u.lang = speechLanguages[language] ?? 'en-US';
```

The final voice should follow the language of the displayed result, not an independently changed dropdown.

### 2. Backend cannot start from its declared dependencies — P1, reproduced

[AI integration:5](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/ai/gemini.py#L5), [requirements](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/requirements.txt), [environment example](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/.env.example), [health endpoint:12](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/main.py#L12)

The file named gemini.py imports and calls OpenAI's Responses API. requirements.txt installs google-genai but does not install openai. A clean backend import fails before routes become usable.

The environment example and test_env.py still describe Gemini, and health reports Gemini configuration even though scanning uses OpenAI. A teammate following the setup instructions can configure the wrong provider.

Choose the intended provider and align code, dependencies, example variables, health checks, logging, filenames, and presentation claims. The current execution path is OpenAI; the presence of google-genai in requirements does not establish a working Gemini integration.

### 3. Saved data has no user isolation or authentication — P1

[Medication routes:15](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/medications.py#L15), [scan history:92](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/scan.py#L92), [automatic storage:73](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/scan.py#L73)

All users share the same collections. Medication listing uses an unfiltered find; scan history does the same. Delete routes accept record IDs without ownership checks. Dose logging and adherence also operate globally. An unauthenticated medication-list request returned data in the offline check.

With MongoDB configured, every successful scan is automatically saved. The overview's optional user-controlled saving is not implemented. Returned scan summaries can contain sensitive content.

For a public multi-user service, enforce identity and ownership on every read/write/delete. For the hackathon, a simpler option is disabling server-side persistence and demonstrating fictional data. CORS does not provide data ownership checks.

### 4. Dose logging inserts a record, then returns HTTP 500 — P1, reproduced

[medications.py:39](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/medications.py#L39)

PyMongo adds an ObjectId-valued `_id` to the dictionary passed to insert_one. log_dose returns that mutated dictionary directly. FastAPI's ordinary JSON encoding fails on the ObjectId.

The offline endpoint reproduction confirmed that insertion was invoked and the response was 500. A retry can create an additional record because the original insert already succeeded.

Return an explicit response with a string ID:

```python
inserted = db.doses.insert_one(item)
return {"logged": True, "id": str(inserted.inserted_id)}
```

Also prevent duplicate submissions while a dose request is pending.

### 5. A finished scan can be attached to the wrong photograph — P1, source inspection

[Scan.tsx:3–4](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/Scan.tsx#L3), [replacement controls:8](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/Scan.tsx#L8)

Starting analysis captures the current file, but upload/drop/replacement controls remain usable during the request. If a user replaces photo A with photo B, A's response still calls setResult. The result view uses the current preview, so it can show A's explanation and OCR boxes alongside B's photograph.

Either lock replacement while processing or invalidate outstanding requests when the file changes. Store each result together with the specific image and options that produced it.

### 6. AI output is parsed, but not meaningfully validated — P1

[gemini.py:61–84](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/ai/gemini.py#L61), [result rendering](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/Scan.tsx#L11)

The prompt requests a shape, but the code only parses JSON and replaces a few non-list values with empty arrays. It does not validate required strings, nested list items, severity values, or a defined unreadable-label result. There is no Pydantic analysis-response model.

The offline check accepted `three_things: [null]` and an object-valued summary. Those shapes are incompatible with the renderer. It also silently converted `uncertainties: "Unreadable dose"` to an empty list, removing the uncertainty message.

Validate a complete response schema, reject malformed output with a recoverable error, and model unreadable/missing fields explicitly. Treat displayed quotes as AI-extracted text, not independently verified evidence. Schema validation checks structure, not transcription accuracy.

### 7. Accessibility controls do not reliably improve the important content — P1 for this product

[styles.css:3](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/styles.css#L3), [App.tsx:2](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/App.tsx#L2)

Large-text mode changes only the outer shell's font size to 18px. Most content has explicit pixel sizes: result explanations 11px, source quotes 10px, labels 9px, and summaries 14px. Those elements do not grow with the parent setting.

High-contrast mode changes only two variables. In combination with dark mode it replaces the lighter muted text with a darker color. Calculated contrast for muted text on the dark panel falls from approximately 6.28:1 to 2.33:1. Default muted text on white is approximately 3.90:1.

Use scalable text sizes, define complete palettes for combined modes, and test the actual result text. Also add accessible names to icon-only controls, announce asynchronous results/errors, expose toggle states, and manage focus when views change. There are no aria-live regions in the current source. A real keyboard/screen-reader check is still needed.

## Other important findings

### 8. Scan processing runs blocking work inside an async handler — P2

[scan.py:15–81](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/scan.py#L15)

The async route directly calls the synchronous OpenAI client, Tesseract, and synchronous MongoDB operations. These calls execute on the event-loop thread. Under the provided single-process Uvicorn command, they can delay unrelated requests while a scan runs.

Use an async API client and appropriate async storage, or offload synchronous work to the thread pool. Bound OCR execution time. This finding is based on source, not measured load testing.

### 9. Optional storage can destroy an otherwise successful scan — P2, reproduced

[scan.py:73–82](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/scan.py#L73), [db.py](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/db.py)

Analysis succeeds before database access. If the configured database is unavailable, the uncaught error prevents the result from reaching the user. The offline reproduction returned 500 after a successful mocked analysis.

Separate analysis success from persistence success. Return the analysis with a clear “not saved” status when optional storage fails.

### 10. Production caching can keep users on old code — P2

[sw.js:1–5](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/public/sw.js#L1)

The service worker uses a fixed cache name and cache-first responses for the HTML shell. With unchanged worker code/cache version, a later frontend deployment can continue serving the cached HTML and its old asset references.

Version the shell cache or use a deliberate update strategy, such as network-first navigation and content-hashed static assets. Test an upgrade from a previously installed version, not just a first visit.

### 11. Reminders stop when the user leaves the MedMinder tab — P2

[MedMinder.tsx:2](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/MedMinder.tsx#L2), [App.tsx:2](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/App.tsx#L2)

The interval is owned by MedMinder and is cleared when that component unmounts. Switching to Scan or History unmounts it. The UI says reminders work while the app is open, but the current implementation requires that particular tab to remain mounted.

Move scheduling to a persistent app-level component and describe delivery limits accurately. Validate time strings; currently arbitrary values can be saved and silently never match the clock. The daily chart also groups using UTC dates while showing local weekday labels, which can place late-evening entries under an unexpected day.

### 12. Saved history cannot reopen a complete result — P2 / product gap

[History.tsx:2](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/frontend/src/pages/History.tsx#L2), [history endpoint:102](https://github.com/Kevin-Hennet/labellens-2/blob/f41f3a0f1e03663aed531074bd55d813920bf63f/backend/app/routers/scan.py#L102)

History is a title/summary list with delete. There is no scan-detail route or reopen action. Navigating away from Scan unmounts its state, so the full results and original image are lost from the interface. Persisted results omit OCR boxes and do not include the original image.

If reviewing previous instructions is part of the product, add a deliberate result-detail flow and decide what source evidence will be retained under the user's control.

## Implementation versus PresDes overview

| Area | What the committed code actually does |
|---|---|
| Brand and scope | LabelLens; medicine labels, bills, and leases |
| AI provider | OpenAI Responses API in gemini.py; Gemini dependency/configuration remains |
| Camera | File input with capture hint; no embedded camera preview/shutter workflow |
| Results | Generic summary, three things, flags, key fields, uncertainty messages |
| Original label | Image shown; extracted_text is returned but not displayed as a full transcription |
| Audio | Reads generated summary/explanations/flags; no section-level original-text playback |
| Dates and directions | May appear in generic key fields; no required, explicit missing-date/directions state |
| Pharmacist questions | Requested from AI and returned, but not rendered |
| Reading levels | Selection affects a new scan request; no instant switch between two stored explanations |
| History | Automatic when MongoDB is configured; shared summary list with delete, no reopening |
| Medication tracking | Manual entry, logs, chart, and component-local browser reminders |
| Drug interactions | Individual FDA label lookup; no pairwise interaction analysis |
| UI tooling | React, TypeScript, Vite, Tailwind, Lucide, Recharts; no shadcn/ui or Framer Motion dependency |
| Deployment | Docker Compose and nginx files exist; README describes a different FastAPI-static/Caddy setup |

The overview is useful product context, not proof that every described feature is complete. These differences should be resolved in the demo and submission copy.

## Additional observations

- The FDA lookup deliberately avoids declaring combinations safe. That is a good scope choice. Its links lead to API documentation rather than the exact returned label record, so source verification could be improved.
- Upload limits are checked after reading the entire upload. The frontend also accepts any image MIME type while the backend accepts only JPEG, PNG, and WEBP. Validate and align these boundaries.
- The camera button sets capture on a shared input and never removes it for the upload action. Revoke obsolete object URLs and reset the input when replacing a file.
- Read-aloud is not cancelled on navigation/unmount and lacks an error handler. Speech can continue after the visible result disappears.
- Delete handlers in History and MedMinder do not handle rejected requests locally.
- OCR highlighting matches individual words by substring across source quotes; common words can be highlighted outside the intended passage. It is not precise phrase-to-image grounding.
- bill_checker.py detects repeated text/amounts and extracts totals, but does not sum line items or compare arithmetic despite the UI's “Bill arithmetic check” label.
- The README describes missing files, a different API contract, an instant reading-level toggle, and a FastAPI static-file deployment that main.py does not implement. The separate deploy/nginx.conf proxies the root to the API, which returns JSON, whereas the Compose frontend nginx serves the UI.
- The repository has no automated application test suite or CI workflow. test_env.py only prints whether two variables exist.
- The frontend is manually compressed into very long lines and uses any extensively. Reformat it, extract result/audio/capture components, and type shared API data before expanding features.

## What is worth keeping

The separation of routes, services, prompts, configuration, and frontend API calls is understandable. The UI has consistent result sections, source-excerpt slots, uncertainty messages, loading/error/empty states, and responsive CSS. The prompts explicitly ask to preserve quantities and avoid inventing instructions. The API key stays in backend code. Local OCR fails softly. The FDA lookup's limited purpose is described honestly. These are useful foundations, even though their behavior needs stronger validation.

## Recommended order

1. Fix the frontend type error and backend provider/dependency mismatch; prove clean setup works.
2. Disable shared persistence for a public demo or implement ownership checks.
3. Fix dose serialization and scan/photo association.
4. Validate AI response structures and implement a clear unreadable-label flow.
5. Make text enlargement and contrast work on the actual result content.
6. Keep the demo focused on medication capture/upload, organized results, source inspection, and audio.
7. Align README, brand, environment examples, deployment instructions, and presentation with the verified implementation.
8. Add focused regression tests for these failures and run one rehearsed phone demo with fictional labels.

The codebase is small enough that focused repairs are preferable to a rewrite.
