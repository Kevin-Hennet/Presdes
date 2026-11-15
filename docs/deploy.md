# Deploy PresDes on Ubuntu

Use an Ubuntu 24.04 LTS Vultr host with Python 3.12, Node.js 22, and Caddy 2.10 or newer. These commands assume an SSH deploy operator with sudo and a dedicated PresDes site. Build as the deploy operator. The systemd service runs as the separate, non-root `presdes` user.

Caddy terminates HTTPS, requires a demo login, and sends the whole site to Uvicorn on `127.0.0.1:8000`. The frontend uses relative `/api/` URLs. Uvicorn serves both the API and the frontend, and applies the app's HTML, service-worker, and asset cache headers. Caddy allows 25 MiB per request and waits up to 120 seconds for upstream response headers. PresDes keeps its own 12 MiB per photo and 24 MiB image total limits, plus multipart overhead.

## 1. Prepare DNS, firewall, and packages

In the authoritative DNS zone, point the chosen hostname's A record to the Vultr public IPv4. Use `@` for the domain itself or the label of a dedicated subdomain. Set an AAAA record only when that hostname should reach the same host over IPv6. Verify both records before asking Caddy for a certificate.

```bash
dig +short presdes.example.com A
dig +short presdes.example.com AAAA
```

Allow your SSH port before enabling the firewall. Allow inbound TCP 80 and 443 in the applicable Vultr firewall and on the host. The Uvicorn port stays on loopback. Adapt the SSH rule if the host uses a different port.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg dnsutils ufw python3.12-venv
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Install Node.js 22 from NodeSource and Caddy from its stable package repository. Review the NodeSource setup script before running it.

```bash
node_setup=$(mktemp)
curl -fsSL https://deb.nodesource.com/setup_22.x -o "$node_setup"
less "$node_setup"
sudo bash "$node_setup"
rm -- "$node_setup"
sudo apt-get install -y nodejs
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
caddy_repo=https://dl.cloudsmith.io/public/caddy/stable
curl -fsSL "$caddy_repo/gpg.key" | sudo gpg --dearmor --output /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL "$caddy_repo/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
node --version
python3.12 --version
caddy version
```

[GoDaddy DNS records](https://www.godaddy.com/en/help/manage-dns-records-680) · [NodeSource installation](https://github.com/nodesource/distributions) · [Caddy installation](https://caddyserver.com/docs/install)

## 2. Clone the branch and configure private settings

Authenticate Git through an authorized SSH key or credential helper if the repository requires it. Use your deploy operator account for Git and the build.

```bash
git clone --branch master https://github.com/Kevin-Hennet/Presdes.git "$HOME/presdes-source"
cd "$HOME/presdes-source"
getent passwd presdes >/dev/null || sudo useradd --system --user-group --home-dir /opt/presdes --shell /usr/sbin/nologin presdes
sudo install -d -m 0755 /opt/presdes
sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)" /opt/presdes/releases
sudo install -d -m 0700 /etc/presdes
sudo test -e /etc/presdes/presdes.env || sudo install -m 0600 backend/.env.example /etc/presdes/presdes.env
sudoedit /etc/presdes/presdes.env
```

The application reads these settings from the systemd environment file.

| Name | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Private API key for live analysis |
| `OPENAI_MODEL` | Model used for label analysis |
| `MONGODB_URI` | Private Atlas connection URI |
| `MONGODB_DATABASE` | Use `presdes` for the existing data |
| `MONGODB_SESSION_SECRET` | Stable signing secret for browser history sessions |

Enter credentials through the editor and keep the file root-owned with mode `0600`. Keep the existing signing secret stable across deploys and rollbacks. If bootstrapping a fresh installation with no prior sessions, generate a random secret of at least 32 characters. In Atlas, allow only the Vultr server's actual egress address for this deployment, such as an IPv4 `/32`. Use database credentials with read, write and index creation access to the `presdes` database. URL-encode reserved characters in Atlas credentials inside the connection URI.

Photos and the current workspace live in browser storage for the site's exact origin. History ownership follows the signed cookie for that origin. A new hostname starts with its own local workspace and browser session. Existing records remain in Atlas under their existing owners.

[Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)

## 3. Build and start Uvicorn

Build the exact commit before activating it. The script creates a release directory, installs the pinned Python requirements from wheels, runs `npm ci` and the full TypeScript and Vite build, then checks an actual HEIC-to-JPEG conversion. Activation switches the release pointer, restarts the service, and checks the local API and homepage. A failed activation restores the previous release when one exists.

```bash
revision=$(git rev-parse HEAD)
bash deploy/build-release.sh "$revision"
sudo install -m 0644 deploy/presdes.service /etc/systemd/system/presdes.service
sudo systemctl daemon-reload
sudo bash deploy/activate-release.sh "$revision"
sudo systemctl enable presdes.service
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
```

The health response should show `status: ok`, `openai_configured: true`, and `scan_storage: mongodb_configured`. These fields indicate liveness and configuration presence. The live test below checks the provider and database.

## 4. Configure Caddy and protect demo access

Run `caddy hash-password` and enter a strong demo password at the prompt. Copy the resulting hash into the root-only Caddy environment file using `sudoedit`. Share the demo password through the agreed private channel. The package's default Caddyfile is backed up before replacement. On a multi-site Caddy host, import the PresDes site block into the existing configuration and validate the combined file.

```bash
caddy hash-password
sudo test -e /etc/caddy/presdes-demo.env || sudo install -m 0600 /dev/null /etc/caddy/presdes-demo.env
sudoedit /etc/caddy/presdes-demo.env
```

Set the site hostname without a scheme, the demo username, and the hash generated above. Enter the hash literally in the editor.

```dotenv
PRESDES_DOMAIN=presdes.example.com
PRESDES_DEMO_USER=demo
PRESDES_DEMO_HASH=
```

Validate the candidate as the Caddy service user with its real environment file before switching. On first setup, restart Caddy to load the environment file and obtain the certificate.

```bash
sudo install -d -m 0755 /etc/systemd/system/caddy.service.d
sudo install -m 0644 deploy/caddy-presdes.conf /etc/systemd/system/caddy.service.d/presdes.conf
sudo install -m 0644 deploy/Caddyfile /etc/caddy/presdes.Caddyfile.pending
if sudo systemd-run --quiet --wait --pipe --collect \
  -p User=caddy -p Group=caddy -p EnvironmentFile=/etc/caddy/presdes-demo.env \
  /usr/bin/caddy validate --adapter caddyfile --config /etc/caddy/presdes.Caddyfile.pending; then
  (sudo test -e /etc/caddy/Caddyfile.before-presdes || sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-presdes) &&
    sudo mv -- /etc/caddy/presdes.Caddyfile.pending /etc/caddy/Caddyfile &&
    sudo systemctl daemon-reload &&
    sudo systemctl enable caddy &&
    sudo systemctl restart caddy
fi
```

After later Caddyfile edits, validate the candidate again and reload with `sudo systemctl reload caddy`. Restart Caddy after changing its service environment or unit drop-in.

[Caddy Basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth) · [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## 5. Verify the live site

Replace the sample hostname and username below. The first request should return 401. The authenticated health check should return the same JSON as the loopback check. The authenticated session request should return 204 and checks the HTTPS origin handling. Curl prompts for the password when given only a username.

```bash
origin=https://presdes.example.com
demo_user=demo
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' "$origin/api/health"
curl --fail --silent --show-error --user "$demo_user" "$origin/api/health"
curl --fail --silent --show-error --user "$demo_user" -X POST \
  -H "Origin: $origin" -H 'X-PresDes-Request: 1' \
  --output /dev/null --write-out '%{http_code}\n' "$origin/api/saved-scans/session"
```

On a phone over cellular, open the HTTPS site and sign in. Capture or upload a de-identified training label. For a full smoke test, analyze it, confirm it appears in **Scan history**, bookmark it, reload and check the restored Scan workspace, then remove the bookmark and verify the history entry is still present. Confirm camera permission and speech on the phone. Remove only the test entry afterward. A live analysis uses the configured OpenAI account.

## 6. Redeploy or roll back

Build the next release before switching the service. The previous release remains on disk.

```bash
cd "$HOME/presdes-source"
git pull --ff-only
revision=$(git rev-parse HEAD)
bash deploy/build-release.sh "$revision"
sudo bash deploy/activate-release.sh "$revision"
```

If a live check fails after the switch, roll back to the previous healthy SHA and recheck HTTPS. The script records the previous release after a successful switch. Application secrets and Atlas data are shared across releases.

```bash
readlink /opt/presdes/previous
sudo bash deploy/activate-release.sh FULL_PREVIOUS_COMMIT_SHA
sudo systemctl status presdes.service caddy.service --no-pager
sudo journalctl -u presdes.service -u caddy.service -n 80 --no-pager
```

Use `sudo systemctl restart presdes.service` after editing the application environment file. If a Caddy change fails, restore the last working Caddyfile and service environment, validate, and restart Caddy. Preserve release directories needed for rollback.

| Symptom | Check |
| --- | --- |
| 502 from Caddy | Check `presdes.service` and loopback `/api/health`, then check the Caddy journal. |
| TLS or certificate failure | Check the hostname's A and AAAA records, inbound 80 and 443, and the Caddy journal. |
| Browser session POST returns 403 | Check the public HTTPS Origin, Caddy's original Host and forwarded scheme, and Uvicorn's loopback proxy trust. |
| Upload returns 413 | Keep each photo at 12 MiB or less and the combined photos at 24 MiB or less. Caddy's extra MiB covers multipart framing. |
| Atlas timeout or authorization failure | Check the host egress allowlist, URI, and database user privileges. |
| Frontend build fails | Read the TypeScript or build error, or check memory and disk space. Fix the issue before activating the release. |
