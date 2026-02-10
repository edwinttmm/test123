# VPS Deployment Guide (GitHub → Production SaaS)

This guide shows exactly how to deploy the **Digital Employees Platform** on a fresh Ubuntu VPS.

---

## 1) Prerequisites

- A VPS (Ubuntu 22.04+ recommended), minimum:
  - 2 vCPU
  - 4 GB RAM
  - 40 GB disk
- A domain name (e.g. `app.yourdomain.com`)
- GitHub repository access
- Stripe account (test/live)
- OpenAI API key

---

## 2) DNS Setup

Create DNS A records:

- `app.yourdomain.com` → VPS public IP
- `api.yourdomain.com` → VPS public IP

Wait for DNS propagation.

---

## 3) SSH into the VPS

```bash
ssh root@YOUR_VPS_IP
```

Create a non-root deploy user:

```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
```

---

## 4) Install Docker + Compose + Git

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

---

## 5) Clone from GitHub

```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/YOUR_ORG/YOUR_REPO.git digital-employees
cd digital-employees
```

If private repo, use SSH deploy key:

```bash
ssh-keygen -t ed25519 -C "deploy@yourdomain.com"
cat ~/.ssh/id_ed25519.pub
```

Add this key in GitHub repo settings, then clone with SSH URL.

---

## 6) Create Production Environment File

Copy env template:

```bash
cp .env.example .env
```

Edit `.env` with real values:

```bash
nano .env
```

### Required keys and where to get them

- `DATABASE_URL`
  - Postgres connection string.
  - For internal compose DB use:
    - `postgresql://postgres:postgres@postgres:5432/digital_employees`
- `REDIS_URL`
  - Use compose redis service:
    - `redis://redis:6379`
- `JWT_SECRET`
  - Generate random secret:
    - `openssl rand -base64 48`
- `OPENAI_API_KEY`
  - OpenAI dashboard → API keys
- `STRIPE_SECRET_KEY`
  - Stripe dashboard → Developers → API keys
- `STRIPE_WEBHOOK_SECRET`
  - Stripe CLI or dashboard webhook endpoint secret
- `NEXT_PUBLIC_API_URL`
  - Public API URL for web app:
    - `https://api.yourdomain.com`

> Important: never commit `.env` to GitHub.

---

## 7) Prepare Reverse Proxy + SSL (Nginx + Let's Encrypt)

Install nginx + certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create nginx config:

```bash
sudo nano /etc/nginx/sites-available/digital-employees
```

Example config:

```nginx
server {
  server_name app.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  server_name api.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/digital-employees /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Issue SSL certificates:

```bash
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
```

---

## 8) Build and Start the Platform

From repo root:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose logs -f worker
```

---

## 9) Run Prisma Setup

Run Prisma generate/migrate from API container:

```bash
docker compose exec api npx prisma generate
docker compose exec api npx prisma migrate deploy
```

(Optional) seed sample data if you add a seed script later.

---

## 10) Configure Stripe Webhook

In Stripe dashboard:

- Add endpoint: `https://api.yourdomain.com/billing/webhook`
- Subscribe to at least:
  - `customer.subscription.updated`
- Copy webhook signing secret into `.env` as `STRIPE_WEBHOOK_SECRET`
- Restart API:

```bash
docker compose restart api
```

---

## 11) Verify Production Health

```bash
curl -I https://app.yourdomain.com
curl https://api.yourdomain.com/health
```

Expected API response contains `ok: true` and loaded employees.

---

## 12) Ongoing Deployments from GitHub

When you push new code:

```bash
cd ~/apps/digital-employees
git pull origin main
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
```

---

## 13) Recommended Production Hardening

- Use managed Postgres/Redis for reliability.
- Rotate API keys regularly.
- Add backups for Postgres volume.
- Add uptime checks and error alerting.
- Restrict VPS firewall:
  - allow `22`, `80`, `443`
  - block direct access to internal service ports.
- Add GitHub Actions CI/CD to automate pull + rebuild.

---

## 14) What to Change Before Real SaaS Launch

1. **Auth hardening**
   - Add login endpoint + JWT issuance/refresh flow.
2. **Billing correctness**
   - Verify Stripe webhook signatures.
   - Handle checkout session linkage to tenant/customer IDs.
3. **Runtime safety**
   - Persist idempotency checks in DB before tool execution.
4. **Observability**
   - Structured logs + centralized log sink.
5. **Security**
   - Add rate limiting, CORS policy, and secure headers.
6. **Data lifecycle**
   - Add retention policies and export/delete flows.

This makes the MVP suitable for real tenants in phased rollout.
