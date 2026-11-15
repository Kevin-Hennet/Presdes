# PresDes review findings and verification

Reviewed upstream commit `f41f3a0f1e03663aed531074bd55d813920bf63f` on November 14, 2026. The work is on `codex/presdes-reliability-accessibility`.

## Numbered findings

| Review finding | Resolution | Verification |
| --- | --- | --- |
| 1. TypeScript production build and speech language | Fixed. Speech uses the selected section's source or explanation language and maps it to a browser language code. | Production build and browser speech test with Spanish explanation and English source. |
| 2. Undeclared OpenAI SDK and stale Gemini setup | Fixed. OpenAI Responses API is the sole analyzer. Health reports liveness and key presence. Backend dependencies and environment example align. | Clean Python 3.11 install and running API. Mock provider tests check the request contract. A missing key returns 503 while the site and health route remain available. |
| 3. Shared scans, medications and doses | Shared routes were retired. The new MongoDB collection stores only opt-in saved-scan text and filters every operation by signed browser session. Browser-local history remains available. | Two sessions could each save their own copy. One session could not list, open, overwrite or delete the other's record. Tests cover forged cookies and cross-origin mutations. |
| 4. Dose logging ObjectId and duplicate retry | Retired dose logging with MedMinder. Scan responses serialize explicit UUIDs and UTC timestamps. | Tests assert that dose logging is unavailable and a valid scan returns serialized JSON. |
| 5. Result attached to the wrong image | Fixed. Each request owns its captured image and explanation language. Replacement aborts and invalidates the previous request. | Browser test delivers a late result after replacement and checks that the newer image and result stay associated. |
| 6. Malformed AI output and missing uncertainty | Fixed. Strict structured output and Pydantic validation cover nested fields, uncertainty, excerpts and unreadable states. | API cases include non-object output, null or missing fields, invalid state, malformed uncertainty, fabricated excerpts, partial readability and unrelated input. |
| 7. Large text, contrast and keyboard access | Fixed. Root-scaled text, full palettes, focus handling, labeled toggles and announcements apply to the working screens. | Playwright checks computed sizes and 320 px reflow. Axe checks WCAG A and AA rules for four palettes. Hardware assistive-technology checks are pending. |
| 8. Blocking scan operations on the event loop | Fixed. OpenAI and openFDA calls are asynchronous. Pillow validation and photo preparation run in a thread pool. | Health stays responsive while an analysis or image processing is in progress. A provider deadline test returns 504. |
| 9. Storage failure drops a scan | Analysis completes independently of both save options. | Simulated browser quota and MongoDB outages leave the result visible. Browser fallback requires its own save action. |
| 10. Stale production shell | Fixed. A replacement service worker clears the legacy LabelLens cache and defers to HTTP caching. | A browser with an installed legacy worker receives the updated shell. Its unrelated cache survives and API requests reach the server. |
| 11. Reminders stop on navigation and chart dates use UTC | Retired MedMinder, reminders, adherence charts and their API routes. | The medication and adherence routes are unavailable and navigation exposes the retained screens. |
| 12. Saved history lacks result details | Both history views reopen excerpts, full label text and explanations. Saved scans contain text only. | Browser tests cover reopening and deleting from both histories, preserving an existing local entry, and keeping the fictional example label in MongoDB. |

## Additional observations

| Observation | Resolution and check |
| --- | --- |
| FDA lookup pointed to generic API documentation | The individual-label reference links the version-specific openFDA record ID. Route and browser fixtures cover exact links, empty results and service failure. A live fictional-name search returned an empty result. |
| Upload read was unbounded and format checks disagreed | Frontend and backend accept JPG, PNG and WebP up to 12 MiB. The API streams with a byte cap and checks image format, dimensions and validity. Tests reject an over-limit stream, mismatched content type, corrupt input and invalid options. |
| One photo could miss text on a round bottle | Successive camera captures and multi-file upload support one to four overlapping views. The API bounds the multipart stream, validates every image and sends them in one OpenAI request. Tests cover count and size limits, individual validation, removal, replacement, phone-width source access and the separate-scan state for mismatched labels. |
| In-page camera occupied a small area and put earlier photos outside the capture view | The modal camera fills the viewport and keeps thumbnails and a photo count at the bottom. Chromium and iPhone WebKit tests verify the preview crop, portrait and landscape layouts, successive shots, thumbnail review, retake and removal, the four-photo limit and reopening with prior photos. They also check focus containment, Escape, scroll lock and stream release on interruption. |
| Shared camera input kept its capture hint | Separate ordinary and native-camera pickers reset their file inputs. Replacement and unmount revoke the preview URL. Browser checks cover a synthetic camera stream and denied permission with file fallback. |
| Read-aloud continued after navigation or omitted uncertainty | Playback cancels when the result leaves view, the reading level changes, or the user presses Stop. Section audio announces unclear or missing text in English before any verbatim excerpt in its source language. The general uncertainty list is spoken in the explanation language. Browser tests cover the order, language, empty sections, errors and cancellation. |
| Source photo appeared below the full result on phones | **View source photo** follows the results heading and opens the matching photo inline, with a full-size link. Browser tests cover tab order, expand and collapse, the scan route, matching photo URLs after replacement, and text-only saved results. |
| Delete failure was unhandled | Saved scan deletion handles browser storage failure visibly. Successful deletion is exercised by Playwright. |
| OCR highlighting matched common words outside the intended passage | Decorative word boxes and Tesseract were retired. The server validates that each excerpt occurs in the AI transcription. Excerpts and the actual source photo are independently available in the live result. |
| Bill arithmetic claim exceeded implementation | Bill and lease analysis and their bill-specific checks were retired. Unsupported document options are rejected at the API. |
| README, dependencies, deployment and reading-level behavior diverged | README, server environment and API contract describe direct Uvicorn startup. Uvicorn serves the web build and API on one origin. Reading levels switch between both returned versions. |
| Repository lacked application tests and CI | Added a FastAPI regression suite, a Chromium/Playwright suite with axe, and GitHub Actions jobs. |
| Compressed source and untyped data | Typed the API client and extracted capture, results and speech components. TypeScript runs as part of the production build. |
| Overview and current product differed | PresDes branding, in-page capture, explicit directions/warnings/dates, full text, selected-section speech, pharmacist questions, local history and two explanation levels are implemented. The README lists future work. |

## Local verification

| Check | Result |
| --- | --- |
| Python 3.11, `requirements-test.txt`, then `python -m pytest -q` from `backend` | 29 passed, including raw and multipart uploads. The saved-scan tests use a controlled collection to exercise the API and query filters, including idempotency, session isolation, CSRF, malformed input, pagination and outage recovery. |
| `npm run build` and `npm test` from `frontend` | TypeScript and Vite build passed. 19 Chromium tests and 2 camera tests in iPhone WebKit emulation passed. Chromium uses a synthetic video stream, and Windows WebKit uses simulated camera APIs. Browser API fixtures cover saved-scan interactions and local-history preservation. |
| Native Windows startup using `scripts/start.ps1` | Passed with Uvicorn serving the built frontend and API. The test instance ran on port 8081. After checking it, the two PresDes containers were stopped and the direct app took over the original port 8080. |
| Real MongoDB Community 8.0.20 on Windows | Bound a temporary database to loopback and used a dedicated verification database. With direct Uvicorn, the browser saved the prepared fictional label, reopened and deleted it. A retry returned one unchanged record. A second browser session received 404 for the first session's detail and delete routes, and a cross-origin delete was rejected. The verification record was removed. |
| Chromium → Vite preview proxy → Uvicorn/FastAPI → mocked OpenAI SDK | Uploaded the fictional label. The HTTP 200 response rendered the matching photo, excerpts, and the mocked explanation. |
| Live OpenAI multi-photo scan | Two overlapping crops of the fictional Pine Sample label returned one transcription with the name, discard date and a single copy of the overlapping directions. A Pine Sample view paired with a clearly different fictional label returned `mismatched_labels` with empty transcription and explanations. |
| Keyboard and responsive layout | Checked skip link, focus after photo and result transitions, source-photo keyboard navigation, and Display dismissal. The expanded photo fits at 320, 390, and 1280 CSS pixels with large text in all four palettes. Axe passed at 320 CSS pixels in each palette. Result excerpts and transcript grow from 17.28 px to 21.6 px. |

### Display ratios

Calculated from the CSS colors. Body text, secondary text and primary button text exceed 4.5:1 in each palette.

| Palette | Body text on card | Secondary text on card | Primary button text |
| --- | ---: | ---: | ---: |
| Default | 14.64:1 | 7.01:1 | 7.45:1 |
| Dark | 13.42:1 | 9.43:1 | 10.78:1 |
| High contrast | 19.64:1 | 12.25:1 | 10.65:1 |
| Dark and high contrast | 19.03:1 | 17.46:1 | 15.56:1 |

### Pending external checks

- Atlas needs the project's connection URI. The real database round-trip used MongoDB Community on this computer. Use the masked local setup script described in the [README](../README.md) to connect Atlas.
- The OpenAI checks used fictional labels. Extraction accuracy against real photographs remains unverified.
- A physical-phone rehearsal, native camera picker, VoiceOver or TalkBack, and audible playback on the presentation equipment require that device and setup. Follow the [demo checklist](demo.md).
- The GitHub Actions workflow awaits a run on GitHub. Its install, build, and test commands were exercised locally.
