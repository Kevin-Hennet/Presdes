# LabelLens — Understand the fine print

A mobile-first document-literacy app built for HackUMass XIV. LabelLens explains medicine labels, bills, and lease pages in plain language, keeps source excerpts beside claims, and provides an optional medication log/adherence view (MedMinder).

> **Safety boundary:** LabelLens is not medical or legal advice. It does not diagnose, prescribe, decide whether a bill is fraudulent, or determine whether a lease clause is enforceable. It explains text and flags items for human review. Medication interactions are not inferred by an LLM; the current openFDA endpoint only retrieves public label information and explicitly does not return a combination-safety verdict.

## Included

- React + TypeScript + Vite + Tailwind frontend with phone-first UI and installable PWA shell/service worker
- FastAPI backend and OpenAPI docs at `/docs`
- Gemini multimodal extraction/explanation with structured JSON response
- Source excerpts for key fields, summaries, and red flags
- OCR word bounding boxes (Tesseract, optional locally; installed in backend container)
- Browser text-to-speech, simple/standard reading levels, translation prompt, high contrast, dark mode, large text
- MongoDB Atlas scan history, medication list, dose logs, and adherence chart
- Conservative bill screening for repeated-looking line items and printed totals
- openFDA drug-label lookup UI/endpoint (not a drug-interaction checker)
- Print-friendly explanation view (browser Print → Save as PDF)
- Docker Compose for a single VPS: frontend Nginx + FastAPI backend

## Run locally

### 1. Configure backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and set `GEMINI_API_KEY`. Set `MONGODB_URI` to enable persistent scan history and MedMinder. Without MongoDB, scan analysis still works but history and medication features return a clear configuration error/empty state.

Optional OCR word boxes require the Tesseract binary. On macOS: `brew install tesseract`; Ubuntu: `sudo apt-get install tesseract-ocr`. If unavailable, analysis still works and the UI shows text-based source highlights instead of spatial boxes.

Start API:

```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Start frontend (new terminal)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://localhost:8000` in development.

## Environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for live AI document analysis |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` |
| `MONGODB_URI` | MongoDB Atlas connection string; enables history + MedMinder |
| `MONGODB_DB` | Database name (default `labellens`) |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `MAX_UPLOAD_MB` | Upload size limit (default 12) |
| `VITE_API_URL` | Optional API base URL; leave blank for same-origin deployment |

## Deploy to a Vultr VPS with Docker Compose

1. Provision an Ubuntu VPS and point your domain's A record to its public IP.
2. Install Docker Engine and the Compose plugin.
3. Clone this repository onto the VPS.
4. Create `backend/.env` from `backend/.env.example`; add real Gemini and MongoDB credentials. Set `CORS_ORIGINS` to your production domain if you later split frontend/backend origins.
5. Run:

```bash
docker compose up -d --build
```

6. The frontend is exposed on port 80. Put TLS in front with Caddy or Certbot/Nginx before sharing real documents. Never commit `.env` or API keys.
7. Verify `http://YOUR_DOMAIN/api/health` and `http://YOUR_DOMAIN/docs`.

For the Hackathon demo, use three clean, non-sensitive sample images. Avoid real patient, tenant, or billing records.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service/config health |
| POST | `/api/scans` | Upload image and analyze with Gemini |
| GET | `/api/scans` | Scan history |
| DELETE | `/api/scans/{id}` | Delete a saved scan |
| GET/POST/DELETE | `/api/medications` | Medication CRUD |
| POST | `/api/doses` | Log taken/skipped dose |
| GET | `/api/adherence` | Adherence totals + dose records |
| POST | `/api/interactions` | Retrieve individual openFDA label records; no interaction verdict |

## Data and privacy notes

- Raw image bytes are held in memory for the request and are not written to disk or MongoDB.
- Extracted text, summaries, and structured scan fields are stored in MongoDB when configured. The scan-history delete endpoint removes a scan record.
- Medication names, schedule strings, and dose logs are stored in MongoDB. This prototype does not implement user accounts or per-user authorization; do not put real personal health information into a public deployment until authentication, access control, retention controls, TLS, and a privacy review are added.
- Gemini receives the uploaded image for analysis. Review the provider's current data handling terms before using sensitive documents.
- Browser speech uses the device's speech synthesis engine. Medication reminders use the browser Notifications API at the saved clock times while the app is open and permission is granted; background delivery is not guaranteed when the browser is closed.

## MVP demo path

1. Open Scan, upload a clean sample prescription/bill/lease image.
2. Choose document type and reading level, then Explain this document.
3. Review the three key points, red flags, and the quoted source excerpts.
4. Press Read aloud.
5. Open MedMinder, add a sample medicine using a schedule copied from a demo label, then log a dose and review the chart.
6. Open Scan history and demonstrate persisted scans if MongoDB is configured.

## Current prototype limitations

- OCR coordinates are returned by the backend; risk labels are model-generated with source excerpts. A fully calibrated overlay needs coordinate normalization against the exact image dimensions and QA across camera rotations/crops. The interface prioritizes verifiable source excerpts rather than pretending every risk box is perfectly aligned.
- Browser speech and foreground browser notifications are available. Reminder delivery is not guaranteed when the browser is closed; production reminders should use a push-notification service or native app scheduler.
- The bill checker is intentionally conservative and only screens text extracted by Gemini; it is not a medical-coding auditor or a proof of duplicate billing.
- The interaction endpoint retrieves individual openFDA label data but deliberately does not claim that a combination is safe or unsafe. A robust interaction checker requires a validated, authoritative interaction dataset and pharmacist review.
- Authentication, account separation, PDF export, and a formal clinical/legal review are not included in this hackathon prototype.
