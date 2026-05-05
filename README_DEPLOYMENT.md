# OpenClaw Lean Deployment (DigitalOcean Runtime-Only)

This guide is the minimal production path:

- Development stays local in VS Code.
- GitHub is source of truth.
- DigitalOcean droplet is runtime only.
- Docker Compose runs only:
  - `openclaw-gateway`
  - `openclaw-cli`
- No PostgreSQL, no Qdrant, no Chroma.

## 1) Create the droplet

Use DigitalOcean with:

- Ubuntu 24.04 LTS
- Minimum size: **4 GB RAM / 2 vCPU**
- SSH key auth

## 2) Push your latest code from local machine

```bash
git add .
git commit -m "your message"
git push origin main
```

## 3) Connect to server and clone repo

```bash
ssh root@YOUR_DROPLET_IP
apt-get update && apt-get install -y git
mkdir -p /opt/openclaw
cd /opt/openclaw
git clone https://github.com/karaabd23-crypto/openclaw.git repo
cd repo
```

## 4) Prepare server runtime

```bash
bash scripts/setup-server.sh
```

What this does:

- installs Docker + Docker Compose plugin
- enables Docker service
- creates persistent runtime dirs under `/opt/openclaw`

## 5) Create runtime `.env`

```bash
cp .env.example .env
nano .env
```

Required values to set:

- `OPENCLAW_GATEWAY_TOKEN` (generate with `openssl rand -hex 32`)
- at least one model API key (for example `OPENAI_API_KEY` or `OPENROUTER_API_KEY`)

Keep these safety values enabled:

- `OPENCLAW_TOOLS_INVOKE_REQUIRE_CONTROL_APPROVAL=1`
- `OPENCLAW_CONTROL_BUDGET_ENFORCE=1`

Keep host bind loopback-only unless you explicitly want public exposure:

- `OPENCLAW_GATEWAY_HOST_BIND=127.0.0.1`
- `OPENCLAW_BRIDGE_HOST_BIND=127.0.0.1`

## 6) Deploy

```bash
bash scripts/deploy.sh
```

What this does:

- pulls latest git changes (fast-forward only, unless you set `OPENCLAW_DEPLOY_SKIP_PULL=1`)
- validates compose config
- builds a local Docker image explicitly, then starts `openclaw-gateway`
- starts `openclaw-gateway`
- runs health checks

## 7) Verify runtime

```bash
bash scripts/healthcheck.sh
docker compose ps
docker compose logs --tail=100 openclaw-gateway
```

## 8) Access Control UI safely (SSH tunnel)

From your local machine:

```bash
ssh -N -L 18789:127.0.0.1:18789 root@YOUR_DROPLET_IP
```

Open:

- `http://127.0.0.1:18789`

## 9) Routine update

On server:

```bash
cd /opt/openclaw/repo
bash scripts/deploy.sh
```

## 10) Backup and restore (SQLite + file artifacts)

This MVP backup scope is the control layer data:

- SQLite: `control-layer/control.sqlite`
- audit logs: `control-layer/audit/*.jsonl`

Create backup:

```bash
cd /opt/openclaw/repo
export OPENCLAW_STATE_DIR=/opt/openclaw/state
bash scripts/backup.sh /opt/openclaw/backups
```

Validate backup without restoring:

```bash
export OPENCLAW_STATE_DIR=/opt/openclaw/state
bash scripts/restore.sh /opt/openclaw/backups/control-layer-backup-<timestamp>.tar.gz --validate-only
```

Restore (planned maintenance window):

```bash
docker compose stop openclaw-gateway
export OPENCLAW_STATE_DIR=/opt/openclaw/state
bash scripts/restore.sh /opt/openclaw/backups/control-layer-backup-<timestamp>.tar.gz /opt/openclaw/state/control-layer
docker compose up -d openclaw-gateway
bash scripts/healthcheck.sh
```

## 11) Quick control-layer checks

```bash
docker compose run --rm openclaw-cli tasks control budget show
docker compose run --rm openclaw-cli tasks control list --limit 20
docker compose run --rm openclaw-cli tasks control approval list --limit 20
```
