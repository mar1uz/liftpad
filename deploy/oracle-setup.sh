#!/usr/bin/env bash
# Provisionare VM Oracle Always Free (Ubuntu ARM) pentru LIFT / liftpad.
# sudo bash oracle-setup.sh
set -euo pipefail

echo "==> [1/4] Update + Docker"
apt-get update -y
apt-get install -y ca-certificates curl git rsync iptables-persistent
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi
docker --version
usermod -aG docker ubuntu || true

echo "==> [2/4] iptables 80/443 (înainte de REJECT-ul Oracle)"
insert_tcp() {
  local port="$1"
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
}
insert_tcp 80
insert_tcp 443
netfilter-persistent save

echo "==> [3/4] /opt/liftpad"
mkdir -p /opt/liftpad/data
chown -R ubuntu:ubuntu /opt/liftpad

echo "==> [4/4] Gata. De pe Mac: ./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key"
