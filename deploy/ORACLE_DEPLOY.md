# Deploy LIFT pe Oracle Always Free

VM existentă: `instance-20260909-1828` (Ampere A1, `eu-stockholm-1`)
- Public IP: `http://207.127.89.107`
- User SSH: `ubuntu`
- Cheie: `~/.ssh/oracle_lift.key`
- App: `/opt/liftpad`, container `liftpad`, port **80 → 3000**

## Redeploy de pe Mac

```bash
cd ~/antigravity/Launchpad
./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key
```

Verificare: `curl -sI http://207.127.89.107/api/status`

## Prima dată pe un VM nou

1. Deschide în Security List OCI: TCP 22, 80, 443 de la `0.0.0.0/0` (deja setat pe VCN-ul ăsta).
2. `scp` + `sudo bash /tmp/oracle-setup.sh` (Docker + iptables 80/443 **înainte** de regula REJECT Oracle).
3. Apoi `./deploy/deploy.sh …`

UFW nu e folosit: imaginea Oracle respinge tot ce nu e ACCEPT în iptables, independent de Security List.

## Domeniu

Registrar: Porkbun. După A record spre `207.127.89.107`:

```text
A     @     207.127.89.107
A     www   207.127.89.107
```

Șterge A-urile de parking Porkbun (`207.207.210.*`) și CNAME `www → pixie.porkbun.com`.
Caddy emite Let's Encrypt pentru `https://liftpad.xyz`. nip.io rămâne fallback Phantom până propagă DNS.
