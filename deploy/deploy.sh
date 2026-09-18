#!/usr/bin/env bash
# Exemplu: ./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key
set -euo pipefail
IP="${1:?IP}"
USER="${2:-ubuntu}"
KEY="${3:-$HOME/.ssh/oracle_lift.key}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER@$IP")
RSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

echo "==> sync $ROOT -> $USER@$IP:/opt/liftpad"
"${SSH[@]}" "sudo mkdir -p /opt/liftpad/data && sudo chown -R $USER:$USER /opt/liftpad"
# Keep production registry / platform state; never clobber with empty local data/.
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '*.tsbuildinfo' --exclude coverage \
  --exclude 'data/platform-launches.json' --exclude 'data/lift-platform.json' \
  -e "$RSH" \
  "$ROOT/" "$USER@$IP:/opt/liftpad/"

echo "==> docker compose build + up"
"${SSH[@]}" "cd /opt/liftpad && sudo docker compose up -d --build"

echo "==> health"
sleep 8
"${SSH[@]}" "curl -fsS -o /dev/null -w 'http %{http_code}\n' http://127.0.0.1/api/status || sudo docker logs liftpad --tail 40"
"${SSH[@]}" "curl -fsS -o /dev/null -w 'https-nip %{http_code}\n' --max-time 25 https://$IP.nip.io/api/status || sudo docker logs liftpad-caddy --tail 50"
echo "Public: http://$IP"
echo "Phantom: https://$IP.nip.io"
