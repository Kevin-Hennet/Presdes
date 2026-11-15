# PresDes review findings and verification

Reviewed upstream commit `f41f3a0f1e03663aed531074bd55d813920bf63f` on November 14, 2026. The work is on `codex/presdes-reliability-accessibility`.

## Numbered findings

| Review finding | Resolution | Verification |
| --- | --- | --- |
| 1. TypeScript production build and speech language | Fixed. Speech uses the selected section's source or explanation language and maps it to a browser language code. | Production build and browser speech test with Spanish explanation and English source. |
| 2. Undeclared OpenAI SDK and stale Gemini setup | Fixed. OpenAI Responses API is the sole analyzer. Health reports liveness and key presence. Backend dependencies and environment example align. | Clean Python 3.11 install and running API. Mock provider tests check the request contract. A missing key returns 503 while the site and health route remain available. |
| 3. Shared scans, medications and doses | Retired all shared-persistence routes and the database connection. Text saving is opt-in within one browser profile. | Tested retired routes with and without the legacy Mongo setting. Browser tests cover explicit save, reopen and delete. |
| 4. Dose logging ObjectId and duplicate retry | Retired dose logging with MedMinder. Scan responses serialize explicit UUIDs and UTC timestamps. | Tests assert that dose logging is unavailable and a valid scan returns serialized JSON. |
| 5. Result attached to the wrong image | Fixed. Each request owns its captured image and explanation language. Replacement aborts and invalidates the previous request. | Browser test delivers a late result after replacement and checks that the newer image and result stay associated. |
| 6. Malformed AI output and missing uncertainty | Fixed. Strict structured output and Pydantic validation cover nested fields, uncertainty, excerpts and unreadable states. | API cases include non-object output, null or missing fields, invalid state, malformed uncertainty, fabricated excerpts, partial readability and unrelated input. |
| 7. Large text, contrast and keyboard access | Fixed. Root-scaled text, full palettes, focus handling, labeled toggles and announcements apply to the working screens. | Playwright checks computed sizes and 320 px reflow. Axe checks WCAG A and AA rules for four palettes. Hardware assistive-technology checks are pending. |
| 8. Blocking scan operations on the event loop | Fixed. OpenAI and openFDA calls are asynchronous. Pillow validation and photo preparation run in a thread pool. | Health stays responsive while an analysis or image processing is in progress. A provider deadline test returns 504. |
| 9. Storage failure drops a scan | Fixed. The analysis arrives before any optional browser storage write. | A simulated storage quota failure reports “Scan not saved” and leaves the result visible. |
| 10. Stale production shell | Fixed. A replacement service worker clears the legacy LabelLens cache and defers to HTTP caching. | A browser with an installed legacy worker receives the updated shell. Its unrelated cache survives and API requests reach the server. |
| 11. Reminders stop on navigation and chart dates use UTC | Retired MedMinder, reminders, adherence charts and their API routes. | The medication and adherence routes are unavailable and navigation exposes the retained screens. |
| 12. Saved history lacks result details | Fixed. Local history reopens the excerpts, full label text and explanations. Saved scans contain text only. | Browser test reloads, reopens the result, verifies the text-only status and deletes the entry. |

## Additional observations

| Observation | Resolution and check |
| --- | --- |
| FDA lookup pointed to generic API documentation | The individual-label reference links the version-specific openFDA record ID. Route and browser fixtures cover exact links, empty results and service failure. A live fictional-name search returned an empty result. |
| Upload read was unbounded and format checks disagreed | Frontend and backend accept JPG, PNG and WebP up to 12 MiB. The API streams with a byte cap and checks image format, dimensions and validity. Tests reject an over-limit stream, mismatched content type, corrupt input and invalid options. |
| Shared camera input kept its capture hint | Separate ordinary and native-camera pickers reset their file inputs. Replacement and unmount revoke the preview URL. Browser checks cover a synthetic camera stream and denied permission with file fallback. |
| Read-aloud continued after navigation | Playback cancels when the result leaves view and on reading-level changes. Browser tests check language, errors and navigation cleanup with controlled voices. |
| Delete failure was unhandled | Saved scan deletion handles browser storage failure visibly. Successful deletion is exercised by Playwright. |
| OCR highlighting matched common words outside the intended passage | Decorative word boxes and Tesseract were retired. The server validates that each excerpt occurs in the AI transcription. Excerpts and the actual source photo are independently available in the live result. |
| Bill arithmetic claim exceeded implementation | Bill and lease analysis and their bill-specific checks were retired. Unsupported document options are rejected at the API. |
| README, dependencies, deployment and reading-level behavior diverged | README, server environment, API contract and Docker Compose/nginx now agree. Production serves the web build and forwards API requests. Reading levels switch between the two versions returned together. |
| Repository lacked application tests and CI | Added a FastAPI regression suite, a Chromium/Playwright suite with axe, and GitHub Actions jobs. |
| Compressed source and untyped data | Typed the API client and extracted capture, results and speech components. TypeScript runs as part of the production build. |
| Overview and current product differed | PresDes branding, in-page capture, explicit directions/warnings/dates, full text, selected-section speech, pharmacist questions, local history and two explanation levels are implemented. The README lists future work. |

## Local verification

| Check | Result |
| --- | --- |
| Fresh Python 3.11 virtual environment, `requirements-test.txt`, then `python -m pytest -q` from `backend` | 19 passed. Used an environment outside the OneDrive workspace after package hardlinks failed there. |
| `npm ci`, `npm run build`, and `npm test` from `frontend` | Clean install, TypeScript and Vite build passed. 10 Chromium tests passed. |
| `docker compose -p presdes-verify config --quiet`, build and start, then `nginx -t` | Passed. Checked HTML, asset, manifest and worker responses, liveness, an unavailable-provider upload, the retired medication route, and the live openFDA no-match case using a fictional name. nginx returned 413 for an upload over 12 MiB. Checked HTTP cache directives for HTML, the worker, assets and API responses. |
| Chromium → Vite preview proxy → Uvicorn/FastAPI → mocked OpenAI SDK | Uploaded the fictional label. The HTTP 200 response rendered the matching photo, excerpts, and the mocked explanation. |
| Keyboard and emulated mobile | Checked skip link, focus after photo and result transitions, Display dismissal, and reflow at a 320 CSS-pixel viewport with large text. Result excerpts and transcript grow from 17.28 px to 21.6 px. |

### Display ratios

Calculated from the CSS colors. Body text, secondary text and primary button text exceed 4.5:1 in each palette.

| Palette | Body text on card | Secondary text on card | Primary button text |
| --- | ---: | ---: | ---: |
| Default | 14.64:1 | 7.01:1 | 7.45:1 |
| Dark | 13.42:1 | 9.43:1 | 10.78:1 |
| High contrast | 19.64:1 | 12.25:1 | 10.65:1 |
| Dark and high contrast | 19.03:1 | 17.46:1 | 15.56:1 |

### Pending external checks

- A live OpenAI analysis needs a configured project key with model access. The provider and browser fixtures exercise structure and presentation. Extraction accuracy against real photographs remains unverified.
- A physical-phone rehearsal, native camera picker, VoiceOver or TalkBack, and audible playback on the presentation equipment require that device and setup. Follow the [demo checklist](demo.md).
- The GitHub Actions workflow awaits a run on GitHub. Its install, build, and test commands were exercised locally.
