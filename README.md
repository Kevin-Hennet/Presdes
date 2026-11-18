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

For live label analysis, set `OPENAI_API_KEY` in the ignored `backend/.env` and restart PresDes. Copy `backend/.env.example` if the file is absent. The default model is `gpt-5.5`. [Fictional training label](frontend/public/fictional-label.png) · [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses)

### MongoDB saved scans

Connect a MongoDB database using the local setup script. The prompt masks the URI and the script generates a session signing secret if needed.

```powershell
.\scripts\configure-mongo.ps1
```

Enter the cluster's connection URI in the masked prompt, then restart PresDes. For Atlas, use a database user that can read, write and create indexes in the dedicated database and authorize the app host through the project's IP access list. The default database is `presdes` and the collection is `presdes_private_saved_scans_v1`. Set `MONGODB_DATABASE` in `backend/.env` to select a different database. Keep the session secret stable across restarts. [Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)

Readable and partially readable label analyses are saved automatically in **Saved medications → Scan history**. Select **Add to saved medications** on a result to bookmark that particular scan. Removing the bookmark leaves the scan in history. Deleting the scan from history also removes its bookmark. Older browser-local records are available under **Legacy browser history** and stay in that browser's storage.

Scan history follows the signed session cookie for this browser profile and hostname. Clearing the cookie or letting it expire can make the records inaccessible. History contains only text.

The Scan workspace keeps one current draft or result, with its source photos, in this browser's storage. You can return from Saved medications, refresh, or reopen the same site to resume it. Choose **New scan** to clear the workspace. An interrupted analysis or preview can be retried from the restored photos. The workspace follows this browser profile and site address, so changing the phone link or clearing browser storage can remove access to it.

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

- Full-screen in-page camera with successive captures and a bottom thumbnail strip, plus multi-file upload and a device-camera picker fallback. Tap a thumbnail to review, remove, or retake any of the four views. Capture uses the framing shown in the live preview. Tap **Done** to keep the photos and return to analysis.
- Directions, warnings, printed dates and full extracted text in the label language, with explicit states for unclear lettering, text that could not be found, and unreadable photos.
- Plain-language and detailed explanations in the selected output language. The reading-level control switches between both versions returned for the current scan.
- Section-level read-aloud using the browser's available voices. It announces unclear or missing text before reading available excerpts. Large text, dark mode and high contrast are available under Display.
- Automatic text-only scan history, with a separate bookmark for each scan you add to Saved medications. Use **View source photo** or **View source photos** below the current result heading to inspect the originals.

Potential future work includes user accounts with private synced history, medication tracking and reminders, and source-backed medication-combination research. The prototype's extraction accuracy and assistive-technology behavior still need real-world evaluation.

## Data and limits

The API validates each selected photo and re-encodes it as a JPEG, stripping camera metadata. It sends all selected views in one OpenAI request with response storage disabled. Provider data handling depends on the project's OpenAI settings. Use de-identified labels for trials. History retains extracted text and explanations for usable analyses. Unreadable, unrelated, and mismatched labels, photo previews, and prepared examples are excluded. If history is unavailable, the result stays visible and **Retry saving scan** uses the existing result without repeating analysis. Anyone using your browser profile can access that profile's saved scans. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

Each scan accepts one to four still JPG, PNG, WebP, GIF, HEIC or HEIF images, up to 12 MiB and 50 megapixels per photo and 24 MiB total. Rotate the same bottle, with some printed text visible in neighboring views. The model attempts to merge overlaps, flags conflicting readings, and asks for separate scans when the photos clearly show different labels. Compare the result with the source photos, especially when views are hard to match. HEIC/HEIF photos upload directly. PresDes converts their primary still image to an oriented, metadata-free JPEG preview in memory before analysis; this also works in browsers without native HEIC display support. The source viewer shows that converted image. The original file is sent for analysis, using the same conversion, only when Analyze label is pressed. Preview conversion does not call OpenAI or save the photo. Auxiliary images and Live Photo video are not analyzed. Animated GIFs must be exported as a still image first. The app uses browser camera permissions on loopback or HTTPS and uses the installed browser voices for speech.

## Serving the app and accessing it from a phone

For an Ubuntu host with systemd and Caddy, see the [Vultr deployment guide](docs/deploy.md).
For a password-protected demo on Render Free, see the [Render deployment guide](docs/render.md).

Uvicorn serves the production Vite build and `/api/` on the same loopback origin. For the in-page camera on a physical phone, use an HTTPS address the phone can reach with a certificate it trusts. Forward HTTPS traffic to `127.0.0.1:8080` and preserve the public Host and forwarded HTTPS scheme so the API can verify the request origin and set a Secure cookie. Allow 24 MiB of images plus multipart request headers and at least 75 seconds for an API response. The API's OpenAI deadline is 60 seconds.

HTML and the service-worker script revalidate. Vite's content-hashed assets are immutable. The replacement worker retires the legacy LabelLens cache and leaves requests to normal browser networking. Reload an already open legacy tab after the replacement worker activates.

## API contract

| Method and path | Behavior |
| --- | --- |
| `GET /api/health` | Liveness and configuration presence for OpenAI and MongoDB. Provider and database connectivity are checked by performing their respective operations. |
| `POST /api/scans/preview` | Raw HEIC/HEIF bytes with the matching image Content-Type; returns a metadata-free JPEG preview with no-store caching. Uses the same size and decoding limits as analysis, without AI or persistence. |
| `POST /api/scans?language=en` | Send a raw image with its matching `Content-Type` or one to four files in repeated multipart fields named `files`. Returns one typed result. Same-origin app requests with `X-PresDes-Request: 1` save usable results to the signed history session. The `X-PresDes-History` response header reports `saved` or `failed` for a usable result. A failed save still returns the analysis. |
| `GET /api/labels?name=…` | Up to five individual openFDA label records. An empty result means no matching records. Upstream failures return HTTP 502. |
| `POST /api/saved-scans/session` | Establishes the signed, HttpOnly history cookie before analysis or a save retry. |
| `GET /api/saved-scans?limit=20` | Lists up to 50 summaries owned by the session. Set `medications=true` to list only bookmarks. Pass `next_before` back as the `before` query parameter to get the next page. |
| `POST /api/saved-scans` | Retries saving `{ "result": <ScanResult> }`. The owner and scan ID identify the original record and preserve its bookmark. A deleted scan returns 410. |
| `GET /api/saved-scans/{id}` and `DELETE /api/saved-scans/{id}` | Reopen an owned scan with its current bookmark state, or delete its text and bookmark. A missing or inaccessible record returns 404. A deleted scan retains a minimal identity marker to prevent stale retries from restoring it. |
| `PUT /api/saved-scans/{id}/medication` and `DELETE /api/saved-scans/{id}/medication` | Add or remove the bookmark for an owned real scan. Repeating either operation keeps the same state. The scan remains in history. |

The explanation language accepts `en`, `es`, `hi`, `fr`, `pt`, `zh` or `ar`. Invalid query options and corrupt images return 422. Oversized images return 413 and unsupported media types return 415. Analysis can also return 502 for malformed provider output, 503 for unavailable analysis and 504 for a timeout.

Saved-scan mutations require the app's own `Origin` and an `X-PresDes-Request: 1` header. The cookie is SameSite Strict and gets the Secure attribute on HTTPS. Configure MongoDB and a session secret to enable history.

## Checks and demo

- From `backend`, install `requirements-test.txt` and run `python -m pytest -q`.
- From `frontend`, run `npm ci`, `npx playwright install chromium webkit`, `npm run build`, and `npm test`. The camera tests also run with iPhone WebKit emulation. On Linux CI, install the browsers with `--with-deps`.
- See the [review findings and verification](docs/verification.md) and the [fictional-label demo and phone checklist](docs/demo.md).

This project can potentially be very useful for old people, dyslexic people or for anyone who finds it hard to read small text.

## Project materials

See the [project archive](docs/project-archive/README.md) for the hackathon presentation, demo recordings, Devpost and LinkedIn drafts, screenshots, and historical planning and review documents.
