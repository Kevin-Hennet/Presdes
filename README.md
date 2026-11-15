# PresDes

**Scan. Understand. Stay Informed.**

PresDes is a medication-label accessibility prototype from HackUMass XIV. Photograph one label, review the AI-extracted directions, printed warnings and expiration or discard information, then read or listen to the section you need. Compare the extracted text against the photograph and confirm medication decisions with a pharmacist.

## Run locally

### Docker Compose

From the repository root, copy `backend/.env.example` to `backend/.env` once. Use `cp` on macOS or Linux, or `Copy-Item` in PowerShell.

```sh
docker compose up --build -d
```

Open [PresDes on port 8080](http://127.0.0.1:8080). Choose **Try fictional example** to explore a prepared result without credentials. The included [fictional label](frontend/public/fictional-label.png) also works as an upload for a live trial.

For live analysis, set `OPENAI_API_KEY` in `backend/.env` and recreate the API container with `docker compose up -d api`. The default `OPENAI_MODEL` is `gpt-5.5`. An override needs Responses API support for image input and strict structured output, and the configured project needs access to that model. [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses) · [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### Development

Use Python 3.11 and Node.js 22. The backend reads the same `backend/.env` file when run directly. Start the API in one terminal.

```sh
cd backend
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-test.txt
python -m uvicorn app.main:app --reload --no-access-log
```

On Windows, use the Python 3.11 launcher and `\.venv\Scripts\python.exe` from the virtual environment to run the install and Uvicorn commands. If OneDrive interferes with package installation, create the environment outside the synced folder. With [uv](https://docs.astral.sh/uv/), from `backend`:

```powershell
$presdesVenv = Join-Path $env:LOCALAPPDATA 'PresDes/.venv'
uv venv --python 3.11 $presdesVenv
$presdesPython = Join-Path $presdesVenv 'Scripts/python.exe'
uv pip install --link-mode copy --python $presdesPython -r requirements-test.txt
& $presdesPython -m uvicorn app.main:app --reload --no-access-log
```

Start Vite in a second terminal.

```sh
cd frontend
npm ci
npm run dev
```

Open [Vite on port 5173](http://localhost:5173). Vite forwards `/api/` to FastAPI on port 8000. [Local API schema](http://127.0.0.1:8000/docs)

## What the prototype includes

- In-page camera preview and still capture, photo upload, and a device-camera picker fallback.
- Directions, warnings, printed dates and full extracted text in the label language, with explicit states for unclear lettering, text that could not be found, and unreadable photos.
- Plain-language and detailed explanations in the selected output language. The reading-level control switches between both versions returned for the current scan.
- Section-level read-aloud using the browser's available voices, plus large text, dark mode and high contrast.
- Optional browser-local saving, reopening and deleting of extracted text and explanations. Saved history contains text only. The source photograph is available while viewing the original scan result.
- Individual product label lookup through openFDA, with links to version-specific records.

Potential future work includes user accounts with private synced history, medication tracking and reminders, and source-backed medication-combination research. The prototype's extraction accuracy and assistive-technology behavior still need real-world evaluation.

## Data and limits

The analysis request sends a photo to the API. The API validates the photo and re-encodes it as a JPEG, stripping camera metadata before forwarding it to OpenAI with response storage disabled. Provider data handling depends on the project's OpenAI settings. Use fictional or de-identified labels for trials. Server-side scan history is disabled. Browser-local history is visible to anyone using that browser profile and can be removed from **Saved scans** or by clearing site data. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

One static JPG, PNG or WebP image is accepted per scan, up to 12 MiB and 24 megapixels. If a device produces HEIC, export it as a JPG first. The app uses browser camera permissions on loopback or HTTPS and uses the installed browser voices for speech.

## Deployment layout

Docker Compose runs nginx for the production Vite build and FastAPI for `/api/`. Only the nginx port is bound to host loopback. For phone access, use a trusted HTTPS reverse proxy on the host that forwards to `127.0.0.1:8080`. Preserve request bodies up to 12 MiB and allow at least 75 seconds for an API response. The API has a 60-second provider deadline. Configure access to the host according to the audience for the demo.

HTML and the service-worker script revalidate. Vite's content-hashed assets are immutable. The replacement worker retires the legacy LabelLens cache and leaves requests to normal browser networking. Reload an already open legacy tab after the replacement worker activates.

## API contract

| Method and path | Behavior |
| --- | --- |
| `GET /api/health` | Liveness plus OpenAI configuration presence and disabled scan storage. A configured key still needs a successful provider request to establish connectivity. |
| `POST /api/scans?language=en` | Send raw image bytes with the matching image `Content-Type`. Returns the typed result, including readability, source language, excerpts, full extraction, both explanation levels when available, uncertainty, and scan ID and timestamp. |
| `GET /api/labels?name=…` | Up to five individual openFDA label records. An empty result means no matching records. Upstream failures return HTTP 502. |

The explanation language accepts `en`, `es`, `hi`, `fr`, `pt`, `zh` or `ar`. Invalid query options and corrupt images return 422. Oversized images return 413 and unsupported media types return 415. Analysis can also return 502 for malformed provider output, 503 for unavailable analysis and 504 for a timeout.

## Checks and demo

- From `backend`, install `requirements-test.txt` and run `python -m pytest -q`.
- From `frontend`, run `npm ci`, `npx playwright install chromium`, `npm run build`, and `npm test`. On Linux CI, install Chromium with `--with-deps`.
- See the [review findings and verification](docs/verification.md) and the [fictional-label demo and phone checklist](docs/demo.md).
