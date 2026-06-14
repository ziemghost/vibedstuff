#!/usr/bin/env bash
# Deploy the smolback server from this repo to the running box.
# App runs as the dedicated `smolback` user out of /opt/smolback.
set -euo pipefail
cd "$(dirname "$0")"

sudo cp app.py /opt/smolback/app.py
sudo chown smolback:smolback /opt/smolback/app.py

# Optional: update the systemd unit / Caddy config if they changed.
if ! sudo cmp -s smolback.service /etc/systemd/system/smolback.service; then
  sudo cp smolback.service /etc/systemd/system/smolback.service
  sudo systemctl daemon-reload
fi
if ! sudo cmp -s Caddyfile /etc/caddy/Caddyfile; then
  sudo cp Caddyfile /etc/caddy/Caddyfile
  sudo systemctl reload caddy
fi

sudo systemctl restart smolback
sleep 1
curl -s --max-time 5 http://127.0.0.1:8000/api/health && echo "  ← smolback healthy"
