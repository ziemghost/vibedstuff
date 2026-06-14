# server — smolback

The tiny stateful backend that powers stateful pages in this repo (e.g. the
[counter](../counter/)). FastAPI + SQLite behind Caddy (auto-HTTPS). Runs on the
box, not on GitHub Pages.

- **Live API:** `https://46-62-200-155.sslip.io` (IPv4 sslip.io host → real Let's Encrypt cert)
- **Stack:** `app.py` (FastAPI/uvicorn on 127.0.0.1:8000) → SQLite at `/opt/smolback/data/smol.db`
- **Security (small toys, not airtight):** CORS + server-side Origin check locked to
  `https://ziemghost.github.io`; parameterized queries only; input validation; **1 GiB DB cap**
  (`PRAGMA max_page_count`); runs as a dedicated `smolback` user with light systemd hardening
  + 256M/50%% resource caps.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/api/health` | `{"ok": true}` |
| GET  | `/api/counter/{name}` | current value |
| POST | `/api/counter/{name}/add_one` | increment, returns new value |

`{name}` must match `^[A-Za-z0-9_-]{1,64}$`.

## Files

- `app.py` — the FastAPI app
- `smolback.service` — systemd unit (deployed to `/etc/systemd/system/`)
- `Caddyfile` — reverse proxy + HTTPS (deployed to `/etc/caddy/Caddyfile`)
- `deploy.sh` — push local source to the running box

## Deploy

The running copy lives at `/opt/smolback` (owned by the `smolback` user). After editing here:

```sh
./deploy.sh        # copies app.py to /opt/smolback and restarts the service
```

First-time setup (already done on the box): create the `smolback` user, a venv at
`/opt/smolback/venv` with `fastapi uvicorn[standard]`, install the service + Caddyfile,
`systemctl enable --now smolback`, and `systemctl reload caddy`.
