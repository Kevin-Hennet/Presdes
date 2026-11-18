## Inspiration

Important medication information is often squeezed into small print and wrapped around a bottle. Finding a direction, warning, or date can be difficult for someone with a visual impairment or reading difficulty. We wanted to make that information easier to access with a device people already carry: their phone. PresDes, short for Prescription Description, turns a label into a clearer reading and listening experience.

## What it does

PresDes is a working medication-label accessibility prototype at **https://presdes.health**.

- **Capture the whole label:** take up to four overlapping photos of the same bottle with a full-screen camera and a thumbnail strip, or upload JPG, PNG, WebP, still GIF, HEIC, or HEIF images. This helps capture text that wraps around a curved bottle.
- **Read and compare:** review the medication name, printed directions, warnings, expiration or discard dates, and full extracted wording. Open the source photos to check the AI's reading.
- **Understand uncertainty:** a prominent “What may be unclear” section flags ambiguous or missing information. Original label wording stays separate from AI explanations.
- **Choose how to access it:** switch between plain-language and detailed explanations, listen to individual sections, and use large text, high contrast, or dark mode. Explanations support English, Spanish, Hindi, French, Portuguese, Chinese, and Arabic; speech depends on the voices available in the browser.
- **Return to your scans:** usable analyses automatically save as text in MongoDB Atlas. “Add to saved medications” bookmarks a scan separately from scan history. The current scan and source photos also survive a page refresh in that browser until the user starts a new scan.

PresDes supports access to printed information. It does not diagnose conditions, prescribe treatment, or check drug interactions. AI can misread a label, so users should compare the source photo and confirm medication questions with a pharmacist.

## How we built it

The frontend uses **React, TypeScript, Vite, CSS, and Lucide icons**. A **Python FastAPI** backend validates uploads, uses **Pillow and pillow-heif** to normalize images and strip camera metadata, and sends the selected views together to the **OpenAI API**. Structured responses organize extracted text, uncertainty, and explanations. The browser's **Web Speech API** provides read-aloud controls.

**MongoDB Atlas is part of the live workflow:** it stores extracted text and explanations, supports reopening scan history, and persists saved-medication bookmarks. Records are scoped to a signed browser session rather than a user account. Source photos are not stored in the Atlas history. Saving can be retried without repeating the AI analysis.

The app runs as one Python web service on **Render**, serving both the frontend and API over HTTPS at **presdes.health**. **GitHub Actions** runs backend tests, Chromium and WebKit browser tests, and release builds before automatically deploying successful pushes to `master`.

We used open-source libraries and tools including React, Vite, FastAPI, Pydantic, Pillow, pillow-heif, PyMongo, Lucide, pytest, and Playwright. Codex/ChatGPT and Cursor assisted development. The public repository includes the source, dependencies, tests, and deployment instructions.

## Challenges we ran into

The hardest product challenge was making information easier to understand without presenting an AI explanation as the original label. We separated those layers, surfaced uncertainty, and kept the photos easy to inspect.

Round bottles introduced overlapping views, glare, and potentially conflicting text. iPhone photos added HEIC decoding and preview requirements. We also had to preserve a scan across refreshes, prevent duplicate history records when saving was retried, and make camera and audio controls work across different browsers. Deploying the complete workflow required coordinating HTTPS, MongoDB connectivity, server secrets, and automated checks.

## Accomplishments that we're proud of

We brought the complete scan-to-history workflow online: multi-photo input, real AI analysis, readable explanations, section audio, automatic Atlas persistence, and saved-medication bookmarks. We verified live GIF and HEIC analysis and tested history isolation and bookmark persistence. Our automated checks cover the backend and browser flows, including Chromium and WebKit.

We are especially proud of treating uncertainty as part of the experience. An accessible answer should help someone see what the system could and could not read.

## What we learned

Accessibility reaches beyond font size. Camera framing, focus, touch targets, spoken uncertainty, and recovering from an interrupted scan all affect whether an experience is usable. We also learned that valid structured AI output is not the same as accurate extraction, and that persistent storage needs clear ownership and retry behavior.

## What's next for PresDes

Next, we want to evaluate extraction accuracy and usability with representative labels and users, strengthen screen-reader and physical-device testing, and explore guided automatic capture while a user rotates a bottle. Longer-term work includes accounts with private synced history, reminders, and carefully evaluated, source-backed medication information. Those are future goals, not completed features.

The linked video demonstrates the project. The live demo is password-protected; access details are supplied privately to the judges. The screenshots use a fictional training label.
