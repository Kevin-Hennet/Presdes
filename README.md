# PresDes

**Scan. Understand. Stay Informed.**

PresDes is a medication-label accessibility prototype from HackUMass XIV. Photograph one label, review the AI-extracted directions, printed warnings and expiration or discard information, then read or listen to the section you need. Compare the extracted text against the photograph and confirm medication decisions with a pharmacist.

## Run locally

### Windows

Install PowerShell 7, Node.js 22 and uv. Run the startup script from the repository root. [Install uv](https://docs.astral.sh/uv/getting-started/installation/)

```powershell
.\scripts\start.ps1
```

The script creates a Python 3.11 environment in `%LOCALAPPDATA%\PresDes\.venv`, builds the frontend, and starts Uvicorn. Open [PresDes on port 8080](http://127.0.0.1:8080). Stop it with **Ctrl+C** in the startup terminal. Use `.\scripts\start.ps1 -Install` after frontend dependencies change.

Choose **Try fictional example** to explore a prepared result without an AI key. For live label analysis, set `OPENAI_API_KEY` in the ignored `backend/.env` and restart PresDes. Copy `backend/.env.example` if the file is absent. The default model is `gpt-5.5`. [Fictional training label](frontend/public/fictional-label.png) · [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses)

### MongoDB saved scans

Connect a MongoDB database using the local setup script. The prompt masks the URI and the script generates a session signing secret if needed.

```powershell
.\scripts\configure-mongo.ps1
```

Enter the cluster's connection URI in the masked prompt, then restart PresDes. For Atlas, use a database user that can read, write and create indexes in the dedicated database and authorize the app host through the project's IP access list. The default database is `presdes` and the collection is `presdes_private_saved_scans_v1`. Set `MONGODB_DATABASE` in `backend/.env` to select a different database. Keep the session secret stable across restarts. [Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)

**Save text to MongoDB** stores the extracted text and explanations using a signed browser session. **Saved scans → MongoDB** lists and reopens that session's records. Browser-local saves remain available under **This browser**. There is no automatic transfer from browser storage. MongoDB history follows the session cookie and does not automatically sync across browser profiles, devices, or hostnames. Clearing the cookie or letting it expire can make the records inaccessible. The photo stays in the active result.

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
- Section-level read-aloud using the browser's available voices. It announces unclear or missing text before reading available excerpts. Large text, dark mode and high contrast are available under Display.
- Optional MongoDB and browser-local saving, reopening and deleting of extracted text and explanations. Saved history contains text only. Use **View source photo** under the original result heading to inspect the image.
- Individual product label lookup through openFDA, with links to version-specific records.

Potential future work includes user accounts with private synced history, medication tracking and reminders, and source-backed medication-combination research. The prototype's extraction accuracy and assistive-technology behavior still need real-world evaluation.

## Data and limits

The analysis request sends a photo to the API. The API validates the photo and re-encodes it as a JPEG, stripping camera metadata before forwarding it to OpenAI with response storage disabled. Provider data handling depends on the project's OpenAI settings. Use fictional or de-identified labels for trials. Press a save button to store the result explicitly. Each save option retains text only, and a storage error leaves the analysis available. Anyone using your browser profile can access that profile's saved scans. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

One static JPG, PNG or WebP image is accepted per scan, up to 12 MiB and 24 megapixels. If a device produces HEIC, export it as a JPG first. The app uses browser camera permissions on loopback or HTTPS and uses the installed browser voices for speech.

## Serving the app and accessing it from a phone

Uvicorn serves the production Vite build and `/api/` on the same loopback origin. For the in-page camera on a physical phone, use an HTTPS address the phone can reach with a certificate it trusts. Forward HTTPS traffic to `127.0.0.1:8080` and preserve the public Host and forwarded HTTPS scheme so the API can verify the request origin and set a Secure cookie. Allow 12 MiB uploads and at least 75 seconds for an API response. The API's OpenAI deadline is 60 seconds.

HTML and the service-worker script revalidate. Vite's content-hashed assets are immutable. The replacement worker retires the legacy LabelLens cache and leaves requests to normal browser networking. Reload an already open legacy tab after the replacement worker activates.

## API contract

| Method and path | Behavior |
| --- | --- |
| `GET /api/health` | Liveness and configuration presence for OpenAI and MongoDB. Provider and database connectivity are checked by performing their respective operations. |
| `POST /api/scans?language=en` | Send raw image bytes with the matching image `Content-Type`. Returns the typed result, including readability, source language, excerpts, full extraction, both explanation levels when available, uncertainty, and scan ID and timestamp. |
| `GET /api/labels?name=…` | Up to five individual openFDA label records. An empty result means no matching records. Upstream failures return HTTP 502. |
| `POST /api/saved-scans/session` | Issues the signed, HttpOnly history cookie for an explicit save. |
| `GET /api/saved-scans?limit=20` | Lists up to 50 summaries owned by the session. Pass `next_before` back as the `before` query parameter to get the next page. |
| `POST /api/saved-scans` | Stores `{ "result": <ScanResult>, "example": false }` for that session. Repeating a save for the same scan returns the original record. |
| `GET /api/saved-scans/{id}` and `DELETE /api/saved-scans/{id}` | Reopen or delete the session-owned record. A missing or inaccessible record returns 404. |

The explanation language accepts `en`, `es`, `hi`, `fr`, `pt`, `zh` or `ar`. Invalid query options and corrupt images return 422. Oversized images return 413 and unsupported media types return 415. Analysis can also return 502 for malformed provider output, 503 for unavailable analysis and 504 for a timeout.

Saved-scan mutations require the app's own `Origin` and an `X-PresDes-Request: 1` header. The cookie is SameSite Strict and gets the Secure attribute on HTTPS. Configure MongoDB and a session secret to enable history.

## Checks and demo

- From `backend`, install `requirements-test.txt` and run `python -m pytest -q`.
- From `frontend`, run `npm ci`, `npx playwright install chromium`, `npm run build`, and `npm test`. On Linux CI, install Chromium with `--with-deps`.
- See the [review findings and verification](docs/verification.md) and the [fictional-label demo and phone checklist](docs/demo.md).
