# LabelLens

> Point your phone at a confusing medicine label. A calm, plain-language explanation is read aloud, every claim is backed by the exact label text, and your medicines are checked against each other.

Built at **HackUMass XIV** (Nov 13-15, 2026).

> **Not medical advice.** LabelLens explains what is printed on the label. It does not diagnose, recommend doses, or tell anyone what to do. Every result shows the source text next to the claim and points to a pharmacist or doctor for decisions.

---

## The problem

Millions of people take medication they don't fully understand. Labels are small, dense and full of jargon. That hits hardest for people with low vision, dyslexia, limited English, or low health literacy, and mistakes here cost health.

LabelLens makes the label **readable, audible and verifiable**:

- **Readable:** plain-language summary at two reading levels, large-text and high-contrast modes.
- **Audible:** one-tap read-aloud, in the user's language (stretch).
- **Verifiable:** the exact label text is shown next to every claim, so users can check the AI.

**Scope: medicine labels only.** Leases and bills are out of scope for this hackathon.

## Why not just Google Lens or a chatbot?

A general vision model can already read a label. We are different in three ways, and the pitch should say so:

1. **Built for people who struggle with labels.** Read-aloud, two reading levels, large text, high contrast and a low-vision typeface (Atkinson Hyperlegible) are core features, not afterthoughts.
2. **It shows its evidence.** Every claim sits next to the exact label text, and the AI only restates what is printed. No guessing at blurry words, no invented advice.
3. **It remembers and cross-checks.** Lens is stateless. LabelLens keeps a "My Medicines" list, and (stretch) checks your medicines against each other using openFDA, with the source cited.

---

## MVP (the version we must demo, done by Saturday ~5 PM)

A complete, working loop: photo in, trustworthy explanation out, deployed at a public URL. If every stretch goal fails, this still wins on its own.

- [ ] **Upload or snap** a photo of a medicine label
- [ ] **Gemini reads the image** and extracts key fields (drug name, strength, form, route, frequency, warnings, dates, refills)
- [ ] **Plain-language summary** with the "3 things to know"
- [ ] **Reading-level toggle** (Simple / Standard), instant, both levels come back in one Gemini call
- [ ] **Red-flag list**: label warnings and dates (expiry / discard-after)
- [ ] **Source text shown** next to every claim ("On your label")
- [ ] **Questions to ask your pharmacist**: 3 questions generated from the label (one extra field in the Gemini JSON)
- [ ] **Read-aloud button** (browser text-to-speech)
- [ ] **Scan history** saved in MongoDB Atlas, with delete
- [ ] **UI polish**: phone-first layout, large-text mode, high-contrast mode, skeleton loaders, clear empty and error states
- [ ] **Deployed on Vultr over HTTPS** with a public URL and a registered GoDaddy domain
- [ ] **Backup demo video** recorded

**MVP definition of done**

- Three clean sample labels work end to end with no errors
- A first-time user gets an explanation in under 15 seconds without instructions
- Works on a real phone, not just a laptop
- Backup demo video is recorded and saved somewhere everyone can reach it

---

## Stretch goals (build in this order, stop at the 8 PM freeze)

**Rule:** only start a stretch goal when the MVP is deployed and the backup video is recorded. Finish one completely before starting the next. Anything not finished by the freeze gets cut, not rushed.

| # | Stretch goal | What it adds | Est. time | Prize it strengthens | Risk |
|---|---|---|---|---|---|
| 1 | **My Medicines** | A saved list built from scan history. One tap to see any medicine again. This is the base for #3 and the "it remembers" pitch. | 30-40 min | MongoDB Atlas, MedTech | Low |
| 2 | **Translation + read-aloud in your language** | Gemini translates the result; the browser reads it in that language (Spanish first, then 1-2 more). | 30-45 min | Accessibility, Gemini | Low |
| 3 | **Interaction check** | With 2+ saved medicines, look up each in openFDA drug-label data and show any interaction text that mentions the other drug, quoted and linked. Never model memory. | 60-90 min | MedTech, Most Impactful AI | Medium |
| 4 | **Live highlight overlay** | Colored boxes drawn over risky text on the photo (red = warning, amber = date). Tesseract word boxes supply positions; Gemini supplies the exact `source_text` to match. | 60-90 min | Best UI/UX, Accessibility | High. Fall back to a highlighted text list if boxes drift. |
| 5 | **Pharmacist-ready export** | One-page PDF summary to bring to an appointment (print stylesheet is enough). | 20-30 min | MedTech, Best Pitch | Low |
| 6 | **MedMinder: schedule + adherence chart** | Daily schedule with reminders; logs doses and charts adherence over time. | 90+ min | MedTech | Medium. Cut unless far ahead. |
| 7 | **Pitch polish** | Impact slide with a real health-literacy statistic (cite the source), a user quote or story, and a 30-second pitch. Runs from 8 PM regardless. | n/a | Best Pitch | Low |

Cut from the plan: deterministic label checks (low pitch value). Voice follow-up questions are a post-hackathon idea.

---

## Stretch schedule (Saturday 5-8 PM)

| Time | Backend / data (you) | AI integration | Product / design |
|---|---|---|---|
| **5:00-5:15** | MVP deployed. Everyone records the backup video together, then sync. | | |
| **5:15-5:55** | **#1 My Medicines:** `GET /medicines` (distinct drugs from scans) | Prompt tweaks from real label tests | **#1 My Medicines** screen |
| **5:55-6:40** | **#3 Interaction check:** `services/openfda.py`, `POST /interactions` | **#2 Translation:** translate endpoint + language picker data | **#2** language picker + read-aloud voice |
| **6:40-7:15** | Finish #3, verify the demo medicine pair returns real label text | Interaction summary prompt (restate only, quote the source) | Interaction screen (warning cards, source link) |
| **7:15** | **Decision gate.** If #1-#3 are solid, try #4 until 8:00 (backend: Tesseract word boxes; design: overlay). If not, spend the time fixing bugs and on polish. Do not start #6. | | |
| **7:15-8:00** | #4 backend, or hardening and deploy fixes | #4 matching `source_text` to boxes, or testing on more labels | #4 overlay UI, or UI polish and phone testing |
| **8:00** | **Feature freeze.** Deploy. No new features. | | |

---

## Prize strategy

**Primary target (decide by Saturday 5 PM): Best Accessibility Hack or Best MedTech Hack.**

- Default: **lead with Accessibility.** Read-aloud, two reading levels, large text, high contrast and a low-vision typeface are all in the MVP, so the claim doesn't depend on stretch goals. Translation (#2) strengthens it.
- Switch to **MedTech** if the interaction check (#3) lands.

| Track | Sponsor / category | Why we fit |
|---|---|---|
| Best Accessibility Hack | HackUMass (Public Good) | Read-aloud, reading levels, high contrast, large text, Atkinson Hyperlegible, translation |
| Best MedTech Hack | HackUMass | Label explanations, pharmacist questions, grounded interaction checks |
| Best UI/UX | HackUMass (Software) | Camera-first flow, highlight overlay if it lands |
| Most Impactful AI Hack | HackUMass (AI) | Real health-literacy problem (crowded category, so not primary) |
| Best Use of Gemini API | MLH / Google | Core engine: vision, structured extraction, summarization, translation |
| Best Use of MongoDB Atlas | MLH | Scan history, My Medicines, extracted fields |
| Best Use of Vultr | MLH | Backend hosting |
| Best Domain Name (GoDaddy Registry) | MLH | Demo domain |
| Build Your A-Team (SpaceXSI) | MLH raffle | Built partly with Cursor; check raffle requirements |
| DEV Writing Challenge | MLH | Post-event write-up |

---

## Timeline

Event runs Nov 13-15, 2026 (ET). Initial submission is Saturday midnight; final submission is Sunday 9:00 AM.

| When | Goal | Who |
|---|---|---|
| **Sat now-5 PM** | Upload, extraction, summary, reading-level toggle, red flags, source text, pharmacist questions, read-aloud, Atlas history, all working end to end. Deploy early and often, not just at the end. | All |
| **Sat ~5 PM** | **MVP deployed on the public URL over HTTPS. Backup demo video recorded.** | All |
| **Sat 5-8 PM** | Stretch goals #1-#3 (see the schedule above), #4 only if the 7:15 gate passes. Design teammate also visits the Sponsor Fair. | All |
| **Sat 8 PM** | **Feature freeze.** | All |
| **Sat 8-10 PM** | Demo prep: rehearse the 60-second script on a real phone, record the final demo video, draft Devpost. | All |
| **Sat 10 PM-midnight** | Finish Devpost, select prize tracks, submit. | Product / design |
| **Sat midnight** | **Initial submission** | Product / design |
| **Sun early AM** | Sleep in shifts. Then bug fixes, polish, final demo video, final Devpost, final submission by **9:00 AM**. | All |

If the MVP slips past 5 PM, drop #4 and #6 first, then #3, and spend the time on polish and the demo.

---

## Deployment (no Docker)

One Vultr VM, one URL, no containers.

1. Create a Vultr VM (Ubuntu). Point the GoDaddy domain's A record at its IP.
2. `git clone`, create a Python venv, `pip install -r requirements.txt`, add `.env`.
3. Build the frontend (`npm run build`). FastAPI serves the `frontend/dist` folder as static files, so there is one process and no CORS setup.
4. Run `uvicorn` under `systemd` (or `tmux` if short on time).
5. Put **Caddy** in front. It gets the HTTPS certificate for the domain automatically.

**HTTPS is required.** Phone camera access and PWA install both fail without it.

Redeploy: `git pull`, `npm run build`, `systemctl restart labellens`. Tesseract (stretch #4 only) is `apt install tesseract-ocr` on the VM.

---

## API contract

`POST /scan` (multipart image) returns:

```json
{
  "id": "scan_...",
  "drug": {
    "name": "Lisinopril",
    "strength": "10 mg",
    "form": "tablet",
    "route": "by mouth",
    "frequency": "once a day"
  },
  "things_to_know": [
    {
      "title_simple": "",
      "title_standard": "",
      "body_simple": "",
      "body_standard": "",
      "source_text": "exact text copied from the label"
    }
  ],
  "red_flags": [
    {
      "kind": "warning | date",
      "title": "",
      "body": "",
      "source_text": "exact text copied from the label"
    }
  ],
  "pharmacist_questions": ["", "", ""],
  "raw_text": "full text read from the label",
  "disclaimer": "LabelLens explains labels. It is not medical advice."
}
```

Other endpoints: `GET /history`, `DELETE /history/{id}`, and (stretch) `GET /medicines`, `POST /interactions`, `POST /translate`.

Rules for the AI layer:

- `source_text` must be copied **exactly** from the label. That is what lets the UI show it as evidence, and later lets us match it to word boxes for the highlight overlay.
- Both reading levels come back in one call, so the toggle is instant.
- Gemini restates the label. It never adds dosing advice, interactions or recommendations that are not printed on the label. Pharmacist questions are things to ask, not answers.
- If the label is unreadable, return an error asking for a retake instead of guessing.

**Interaction check rules (stretch #3)**

- Interactions come only from openFDA drug-label data (the `drug_interactions` section of each medicine's label). Show the quoted text, the drug it came from, and a link.
- Gemini may simplify the quoted text but must not add any interaction that is not in it.
- If nothing is found, say "No interaction found in the label data we checked. Ask your pharmacist." Never say "safe."
- Before the demo, verify the demo medicine pair actually returns text from openFDA.

---

## UI

Design reference lives on the team canvas (four phone screens): Scan, Result, Highlight overlay, MedMinder schedule. Screens for My Medicines and Interaction check are not designed yet; reuse the Result card styles.

**Principles**

- **One hero screen:** the camera view, with the highlight overlay once it exists.
- **Accessible from day one:** large-text toggle, high-contrast toggle, Atkinson Hyperlegible font (designed for low-vision readers), touch targets of at least 44 px, text contrast of at least 4.5:1.
- **Color is never the only signal:** every red or amber flag also carries a text tag (WARNING / DATE) and a number.
- **Motion carries meaning:** highlights fade in over the label, never decoratively.
- **Nothing looks broken mid-demo:** skeleton loaders and clear empty and error states.
- **Test every screen on a phone.**

**Screens**

1. **Scan:** camera view, corner brackets, live hints (light, sharpness), shutter, gallery.
2. **Result:** drug header, disclaimer banner, read-aloud player, Simple / Standard toggle, 3 things to know with "On your label" quotes, Watch-for cards, questions for your pharmacist, Save to history.
3. **My Medicines (stretch 1):** list of saved medicines, tap to reopen, "Check interactions" button.
4. **Interaction check (stretch 3):** warning cards with the quoted label text and a source link.
5. **Highlight overlay (stretch 4):** numbered red and amber boxes on the photo, bottom sheet explaining the selected one.
6. **MedMinder (stretch 6, likely cut):** today's doses, mark as taken, 7-day adherence chart.

---

## Architecture

```
[Phone-first PWA: React]
      |  photo
      v
[FastAPI on a Vultr VM, behind Caddy (HTTPS)]
      |-----> [Gemini API: extract + explain both reading levels (+ translate, stretch)]
      |-----> [openFDA drug-label lookups] ---> grounded interactions (stretch)
      |-----> [Tesseract OCR: word boxes] ---> positions for highlight overlay (stretch)
      v
[MongoDB Atlas: scans, medicines]
      |
[Browser TTS (Web Speech API): read aloud]
```

The MVP needs no OCR step: Gemini reads the image directly.

## Tech stack

- **Frontend:** React + Tailwind + shadcn/ui + Framer Motion (installable PWA)
- **Backend:** Python FastAPI
- **AI:** Gemini API (vision + text), structured JSON output
- **Data:** MongoDB Atlas
- **Grounding:** openFDA drug-label API (stretch)
- **OCR:** Tesseract with word-level bounding boxes (stretch #4 only)
- **Hosting:** Vultr VM + Caddy, GoDaddy domain
- **Speech:** Web Speech API
- **Tooling:** Cursor

---

## Team

| Name | Role | Owns |
|---|---|---|
| *[Name]* | Backend / data lead | FastAPI, database, openFDA lookups, Vultr deploy and Caddy, domain, (stretch) OCR |
| *[Name]* | AI integration | Gemini prompts and calls, structured JSON, translation, interaction summaries, sample label testing |
| *[Name]* | Product / design | Frontend UI, hero screen polish, pitch, demo script, Devpost, DEV post |

Everyone: test on a real phone, and when blocked for more than 15 minutes, say so.

---

## Repo structure

```
labellens/
├── README.md
├── .env.example              # GEMINI_API_KEY, MONGODB_URI
├── .gitignore
│
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py           # also serves frontend/dist
│   │   ├── config.py
│   │   ├── db.py             # MongoDB Atlas connection
│   │   ├── routers/
│   │   │   ├── scan.py       # POST image -> analysis
│   │   │   ├── history.py    # GET/DELETE past scans
│   │   │   ├── medicines.py  # stretch: My Medicines
│   │   │   └── interactions.py   # stretch
│   │   ├── services/
│   │   │   ├── openfda.py    # stretch: grounded interaction lookup
│   │   │   └── ocr.py        # stretch: word bounding boxes
│   │   ├── ai/               # AI teammate owns this folder
│   │   │   ├── gemini.py
│   │   │   ├── prompts.py    # extract, explain, translate, interaction summary
│   │   │   └── schemas.py    # JSON shapes Gemini must return
│   │   └── models/
│   │       └── schemas.py
│   ├── samples/              # 3 clean demo label images
│   └── tests/
│
├── deploy/
│   ├── Caddyfile
│   └── labellens.service     # systemd unit
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── public/
    │   └── manifest.json     # installable PWA
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   └── client.ts
        ├── pages/
        │   ├── Scan.tsx      # hero screen: camera
        │   ├── Result.tsx
        │   ├── History.tsx
        │   ├── Medicines.tsx     # stretch
        │   └── Interactions.tsx  # stretch
        ├── components/
        │   ├── CameraCapture.tsx
        │   ├── HighlightOverlay.tsx   # stretch
        │   ├── Summary.tsx
        │   ├── RedFlagList.tsx
        │   ├── SourceQuote.tsx
        │   ├── PharmacistQuestions.tsx
        │   ├── ReadAloud.tsx
        │   ├── ReadingLevelToggle.tsx
        │   └── ui/
        ├── hooks/
        │   ├── useSpeech.ts
        │   └── useAccessibility.ts    # large text, high contrast
        └── styles/
            └── globals.css
```

---

## Running locally

```sh
git clone <repo-url>
cd labellens
cp .env.example .env   # GEMINI_API_KEY, MONGODB_URI

# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs

# frontend (new terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

Phone camera access needs HTTPS, so test the camera on the deployed URL (or a tunnel), not on a plain local IP.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Model invents or misreads a label detail | Show exact `source_text` next to every claim; Gemini restates the label only; unreadable label gets a retake prompt, not a guess |
| Model invents a drug interaction | Only show interactions quoted from openFDA drug-label data, with the source linked |
| openFDA has no text for the demo pair | Verify the pair before the demo; keep the cached result for it |
| Highlight boxes misaligned | Use OCR word boxes for position; Gemini only labels what is risky. Fall back to a highlighted text list |
| Camera fails on the phone | Make sure the site is on HTTPS; keep the upload-from-gallery button as a fallback |
| OCR or camera struggles with glare, curve or angle | Live capture hints, retake prompt, three clean sample images kept for the demo |
| Live demo fails (Wi-Fi, API quota) | Pre-recorded backup video, cached results for the sample labels |
| Late start / scope creep | The stretch-goal rule and the 8 PM freeze; cut from the bottom of the list |
| Out of time Sunday morning | Final submission checklist below, started Saturday evening |

## Responsible AI

- "Not medical advice" banner on every result
- Explains what is on the label; no dosing recommendations, no diagnosis
- Source text shown next to every claim so users can verify it
- Raw images are not stored by default; users can delete history
- Interactions only from cited public sources (openFDA), never from model memory, and "none found" is never presented as "safe"
- Always points to a pharmacist or doctor for decisions

---

## Demo script (60 seconds)

1. Photograph a prescription label. A spoken summary plays.
2. Flip Simple / Standard, turn on large text and high contrast. Point at the "On your label" quote next to a claim: "it shows its evidence."
3. Switch the language and hear it read back (if #2 is done).
4. Scan a second medicine, open My Medicines, tap "Check interactions": a warning card shows the quoted label text and source link (if #1 and #3 are done). Say it: "a chatbot can't do this, because it doesn't remember your medicines."
5. Show the overlay lighting up risky text (if #4 is done).

If a stretch goal isn't ready, cut its step. The script still works.

---

## Submission checklist

**Initial (Sat midnight)**

- [ ] Public URL on the registered domain works on a phone over HTTPS
- [ ] Devpost draft: problem, what it does, how we built it, challenges, what's next
- [ ] Demo video uploaded
- [ ] Repo public, README current, no keys committed
- [ ] Prize tracks selected on Devpost (primary + Gemini, MongoDB Atlas, Vultr, GoDaddy, SpaceXSI raffle)

**Final (Sun 9:00 AM)**

- [ ] Final bug fixes and polish
- [ ] Final demo video
- [ ] Devpost updated with final screenshots and features
- [ ] DEV Writing Challenge post (after submission)
- [ ] Sponsor raffle requirements double-checked (Cursor)

---

## Notes from the team

*(To be added: more info from the group.)*

