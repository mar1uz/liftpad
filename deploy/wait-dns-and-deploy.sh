#!/usr/bin/env bash
# Wait until .xyz publishes liftpad.xyz, then deploy + HTTPS.
set -euo pipefail
KEY="${3:-$HOME/Downloads/ssh-key-2026-09-09.key}"
IP="${1:-207.127.89.107}"
USER="${2:-ubuntu}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> waiting for .xyz registry NS (Porkbun A already 207.127.89.107)"
for i in $(seq 1 90); do
  ns="$(dig +time=3 +tries=1 +short @x.nic.xyz NS liftpad.xyz 2>/dev/null || true)"
  pub="$(dig +time=3 +tries=1 +short @8.8.8.8 A liftpad.xyz 2>/dev/null || true)"
  echo "$(date -u +%H:%M:%S) i=$i registry='${ns:-NX}' google='${pub:-empty}'"
  if echo "$ns" | grep -qi porkbun; then
    echo "==> registry live"
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "TIMEOUT: .xyz registry still NXDOMAIN after 90 min"
    exit 2
  fi
  sleep 60
done

# Give public resolvers / LE a moment after registry publish
sleep 45

echo "==> deploy"
"$ROOT/deploy/deploy.sh" "$IP" "$USER" "$KEY"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER@$IP" \
  'sudo docker exec liftpad-caddy caddy reload --config /etc/caddy/Caddyfile || true'

echo "==> wait for https://liftpad.xyz"
for j in $(seq 1 24); do
  code="$(curl -sI -o /dev/null -w '%{http_code}' --max-time 25 https://liftpad.xyz/api/status || true)"
  echo "$(date -u +%H:%M:%S) https-status=$code"
  if [ "$code" = "200" ]; then
    echo "OK https://liftpad.xyz"
    curl -sI --max-time 20 https://liftpad.xyz | head -20
    exit 0
  fi
  sleep 20
done

echo "deploy finished but HTTPS not 200 yet — caddy logs:"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER@$IP" 'sudo docker logs liftpad-caddy --tail 80'
exit 1
