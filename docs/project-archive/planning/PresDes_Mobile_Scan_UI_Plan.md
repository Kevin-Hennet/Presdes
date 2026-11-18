# PresDes mobile scan page — first design preview

## Outcome and review boundary

Build a working preview of a cleaner, more modern **scan page**, including its empty, photo-review, photo-preparation, analyzing, and error states. The user must see this first before the rest of the app is redesigned. Keep the existing results page, saved medications, full-screen camera behavior, backend, and live deployment intact.

Use a separate `codex/mobile-scan-ui` branch from current `origin/master`, preferably in an isolated worktree. The shared checkout is `[local workspace]/app`. Do not merge or push to `master`: it automatically deploys to Render after CI. Do not deploy this preview to the production service or change its domain, authentication, secrets, or data.

## Visual direction

A calm, modern health app: warm off-white background, white surfaces, deep teal primary actions, dark navy text, generous spacing, soft rounded corners, and restrained borders/shadows. Retain the PresDes identity, readable typography, large text, dark mode, and high-contrast support. Use the existing React/TypeScript/CSS/Lucide stack; this does not need a new UI framework or animation dependency.

Scope new styling to the scan workspace so shared buttons, cards, typography, and global tokens do not inadvertently redesign Results or Saved medications. Keep existing global navigation and Display controls functional and recognizable.

## Scan page layout

1. **Compact introduction:** a clear “Scan your label” heading and one short supporting line, such as “Capture the printed directions, warnings, and dates.” Avoid the current large block of introductory and file-format text.
2. **One obvious next action:** a spacious, polished capture area with a simple camera/label illustration using existing icons or CSS, a prominent “Open camera” button, and a secondary “Choose photos” action. Retain the native device-camera fallback in an accessible secondary position. Never open the camera automatically.
3. **Light guidance:** a short hint about rotating the same bottle and overlapping the photos. Put supported formats and size limits in a keyboard-accessible details disclosure. Keep the relevant data-use disclosure visible before analysis, particularly that photos go to OpenAI and text is saved; simplify its wording rather than hiding it.
4. **Photo review:** after selection, prioritize a large selected-photo preview and a compact horizontal thumbnail strip. Make selecting, adding, retaking, and removing photos straightforward with clear accessible labels. Keep all four-photo and upload-size constraints, supported image types, and HEIC preview behavior. Do not show an empty “0 of 4” counter or empty numbered photo slots. Explain the limit when it is relevant; a screen-reader status can announce changes.
5. **Analyze action:** place the explanation-language control near review, and make “Analyze label” the clear next action. A mobile sticky action area may be used after photos exist, with safe-area padding and enough content padding that it cannot cover controls or errors. Keep “New scan” available without confusing it with the primary action. Do not reset the workspace on refresh or ordinary navigation.
6. **Desktop:** retain a comfortably bounded layout with balanced spacing rather than stretching mobile controls across a very wide card. No horizontal page overflow at narrow widths or large-text settings.

## Motion and analyzing experience

- Add restrained button feedback and short opacity/transform transitions when a photo appears or the page changes between idle, review, and analysis. Avoid bouncy motion and major layout shifts.
- While the actual analysis request is pending, show a dedicated inline analyzing panel with an indeterminate teal scan-line or ring animation, a small photo preview, and a stable “Analyzing your label…” status. A short supporting line can say that the app is reading the photos and preparing an explanation.
- Do not invent percentages, countdowns, progress stages, clinical verification, or completion before the API has responded. Do not hold a finished result to let an animation complete. Avoid promises about exact completion time.
- Tie animations and disabled actions to the actual request state. Preserve cancellation, stale-request protection, retry behavior, and recovery after interruption. Canceling stops waiting locally and should not falsely promise that the server/OpenAI request was undone.
- Give HEIC preparation its own truthful “Preparing photo preview…” state. Make network/provider/validation errors readable, actionable, and consistent with the new layout; preserve selected photos for retry where the existing flow permits it.
- Respect `prefers-reduced-motion`: remove looping and sliding motion while retaining a clear static busy indicator and status text. Use `aria-busy` and a polite status announcement without repeatedly reading every animation cycle. Success uses the existing results page and focus behavior.

## Functional boundaries

Preserve full-screen capture and its bottom strip of previous photos; do not redesign the camera overlay in this first pass. Preserve source-photo access on results, uncertainty audio, all explanation languages, automatic MongoDB history, saved-medication bookmarks, current-scan persistence, and the explicit New scan reset. Do not restore the removed instruction/example sidebar or FDA reference UI.

Start with `frontend/src/pages/Scan.tsx`, `frontend/src/components/Capture.tsx`, and narrowly scoped styles. A small presentational analysis-status component is reasonable. Keep request/storage logic stable and avoid a broad refactor.

## Validation and deliverables

- Run the frontend build and meaningful existing browser tests affected by these changes. Add focused coverage only for new behavior: pending analysis indicator, reduced-motion behavior, error/retry transitions, and preservation of photos/results after interruption or navigation.
- Review at 390px mobile width, 320px narrow width, and desktop; check large text, high contrast, dark mode, focus order, visible focus, labeled controls, and comfortable touch targets.
- Use fictional-label fixtures and controlled slow/error responses for repeatable preview screenshots; fixtures must stay in development/tests and must not replace real production analysis. Do not use private saved scans or expose credentials in artifacts.
- Provide an isolated local preview on an unused port, screenshots of empty/review/analyzing states, and a brief motion recording if the available tooling supports it. Include a way to review the analyzing state without spending API credits repeatedly.
- Commit the scoped implementation to its feature branch, report tests and any limitations, and stop for the user's visual review. No rest-of-app redesign, merge, or production update until that review.
