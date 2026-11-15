# PresDes on Render Free

Deploy one Python web service named `presdes-demo` in Virginia using the Free plan. Point it at `master`, set Auto-Deploy to **After CI Checks Pass**, and leave the root directory at the repository root. The [Blueprint](../render.yaml) defines the service. Use the same settings if creating it manually. [Render Blueprint reference](https://render.com/docs/blueprint-spec)

| Setting | Value |
| --- | --- |
| Build command | `bash render-build.sh` |
| Start command | `python -m uvicorn app.cloud:create_app --factory --app-dir backend --host 0.0.0.0 --port "$PORT" --workers 1 --no-proxy-headers --no-access-log` |
| Health check path | `/healthz` |

The build installs the pinned Python dependencies and compiles the frontend. The same FastAPI service serves the frontend and API over the Render HTTPS URL.

## Publishing changes

Push or merge reviewed changes into `master`. GitHub Actions runs the backend tests on Python 3.11 and 3.12, the Chromium and WebKit browser tests, and the Ubuntu and Render release builds. Render deploys the new revision after those checks pass. A failed check prevents automatic deployment; feature-branch pushes do not update the live app. Watch the GitHub Actions run and then the service's Render deploy status before treating an update as live.

Automatic deploys require a connected Git provider; a service created only from a public repository URL needs that connection configured. Keep the service branch and Auto-Deploy settings aligned with `render.yaml`. [Render automatic deployment documentation](https://render.com/docs/deploys#automatic-deploys)

## Environment variables

| Variable | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.12` |
| `NODE_VERSION` | `22.23.5` |
| `OPENAI_MODEL` | `gpt-5.5` |
| `MONGODB_DATABASE` | `presdes` |
| `PRESDES_DEMO_USERNAME` | `presdes`, or a username you choose |
| `PRESDES_DEMO_PASSWORD` | A strong password generated for the demo |
| `OPENAI_API_KEY` | The server-side OpenAI API key |
| `MONGODB_URI` | The Atlas URI for the existing database |
| `MONGODB_SESSION_SECRET` | The stable server-side history signing secret, at least 32 characters |

Enter the demo credentials, API key, Atlas URI, and session secret in Render's environment settings. Render supplies `PORT` and `RENDER`. For Atlas network access, use the outbound IP ranges listed for this service in Render's Connect menu. [Render outbound IP documentation](https://render.com/docs/outbound-ip-addresses)

The demo password grants access to the app. Each browser still has its own signed saved-scan history session. Existing scans remain in Atlas, but browsers on the new hostname start a new history session. Local browser data is also scoped to the hostname.

## Verify the first deploy

1. Open the Render HTTPS URL. Confirm that `/healthz` returns `200` and `{"status":"ok"}`, and that `/` and `/api/health` return `401` without credentials.
2. Sign in and open `/`. Test the camera and upload using a sample label, then scan and reopen the result from history. In browser devtools, verify that the saved-scan session sets a Secure, HttpOnly cookie and the write uses the public HTTPS origin.
3. Try a four-photo upload. Check Render logs and instance metrics for errors or restarts. The demo handles one scan or preview request at a time. A second request gets a `503` and can retry shortly.

The Free instance has 512 MB of RAM. Verify large uploads on the deployed service before relying on them, especially 48-megapixel HEIC files. [Render compute plans](https://render.com/docs/compute-plans)

Render Free sleeps after 15 minutes of inactivity and can take about a minute to wake. Free web services have no persistent disk, and the workspace receives 750 free instance hours per month. OpenAI usage is billed separately. [Render Free limits](https://render.com/docs/free)

For an application rollback, use the Render dashboard to redeploy a previously verified revision that uses the protected `app.cloud:create_app` entrypoint. [Render rollback instructions](https://render.com/docs/rollbacks)
