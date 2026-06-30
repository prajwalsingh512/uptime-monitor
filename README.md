# 📡 Uptime Monitor (MVP)

A lightweight, full-stack uptime monitor: register URLs, periodically ping them,
and view real-time up/down status with response times in a simple dashboard.

Built as an infrastructure-engineer-stretches-into-full-stack exercise, leaning
heavily on AI assistance for the frontend layer. See [`AI_LOG.md`](./AI_LOG.md)
for the full collaboration log.

## Stack

- **Backend:** Node.js + Express, SQLite (`better-sqlite3`) for storage, `node-cron`
  for scheduled health checks, `axios` for the actual HTTP pings.
- **Frontend:** Single static `index.html` (vanilla JS, no build step) served via nginx.
  Polls the backend every 5 seconds.
- **Orchestration:** Docker Compose — two containers, one command.

## 1-Line Setup

```bash
docker compose up --build
```

- Frontend dashboard: **http://localhost:8080**
- Backend API: **http://localhost:4000**

Give it a few seconds on first boot — `npm install` runs as part of the backend
image build. Once both containers are up, open the dashboard.

## Architecture

```
┌─────────────┐        polls every 5s         ┌──────────────┐
│  Frontend   │ ─────────────────────────────▶ │   Backend    │
│ (nginx,     │   GET /api/urls                │  (Express)   │
│  static JS) │   POST /api/urls               │              │
└─────────────┘   DELETE /api/urls/:id         └──────┬───────┘
     :8080                                              │
                                                  node-cron every 30s
                                                  pings each registered URL
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │   SQLite     │
                                                  │ (urls,checks)│
                                                  └──────────────┘
```

Each health check records: `status_code`, `response_time_ms`, `is_up`, and
`checked_at` timestamp. The dashboard always shows the latest check per URL.

## Screenshots

Screenshots demonstrating both UP and DOWN states (including a DNS-failure
case returning `N/A` and a non-2xx response case returning `403`) are
available in the [`screenshots/`](./screenshots) folder.

Files included: a dashboard with a mix of UP/DOWN entries, an empty dashboard
before any URLs are added, the `docker compose up --build` terminal output,
and the `/` and `/health` API endpoint responses — covering both failure
paths a check can hit (no response at all vs. a bad HTTP response).

## Testing Steps (Up vs. Down Verification)

1. Start the stack: `docker compose up --build`
2. Open **http://localhost:8080**
3. Add a known-good URL — type `https://example.com` in the URL field and click **Add URL**.
   - Within a few seconds (an immediate check fires on registration, then every
     30s thereafter) you should see a green **UP** badge with a `200` status
     code and a response time in milliseconds.
4. Add a known-bad URL — try one of these:
   - `https://this-domain-does-not-exist-zzz123.com` (DNS failure)
   - `https://httpstat.us/500` (returns a 500, counted as DOWN)
   - `http://localhost:9999` (connection refused)
   - You should see a red **DOWN** badge. For DNS/connection failures the
     status code column will show `N/A` since no HTTP response was ever received;
     for a `500` response it will show the actual code.
5. (Optional) Hit `POST http://localhost:4000/api/check-now` to force an
   immediate re-check of everything instead of waiting for the next cron tick:
   ```bash
   curl -X POST http://localhost:4000/api/check-now
   ```
6. Remove a URL anytime with the **remove** button in the table, or:
   ```bash
   curl -X DELETE http://localhost:4000/api/urls/<id>
   ```

### API Reference

| Method | Endpoint                 | Description                          |
|--------|---------------------------|---------------------------------------|
| GET    | `/`                        | Friendly API status/info message      |
| GET    | `/api/urls`               | List all monitored URLs + latest check |
| POST   | `/api/urls`               | Register a new URL (`{ "url": "...", "name": "..." }`) |
| GET    | `/api/urls/:id/checks`    | Last 50 checks for a given URL        |
| DELETE | `/api/urls/:id`           | Stop monitoring a URL                 |
| POST   | `/api/check-now`          | Force an immediate check of all URLs  |
| GET    | `/health`                 | Backend liveness check                |

## Configuration

The check frequency is controlled via the `CHECK_INTERVAL_CRON` environment
variable in `docker-compose.yml` (standard cron syntax, supports seconds).
Defaults to every 30 seconds for fast local demoing; set it to `* * * * *`
for a literal once-a-minute cadence matching the assignment's suggested scale.

## Deployment Sketch (AWS)

For an MVP at this scale, I'd avoid Kubernetes entirely and reach for:

- **ECS Fargate** running the backend container (no servers to manage, scales
  to zero-ish cost at low traffic).
- **RDS Postgres** (swapped in for SQLite once there's more than one backend
  replica, since SQLite doesn't handle concurrent writers across hosts well).
- **S3 + CloudFront** for the static frontend — it's just one HTML file, no
  need for a running container.
- **Application Load Balancer** in front of the ECS service for the API,
  with the frontend's `API_BASE_URL` pointed at the ALB's DNS name.
- **ECR** to host both container images, built via a simple CI step
  (`docker build && docker push`) before each ECS deployment.

A hypothetical Terraform sketch covering this topology lives in
[`deploy/main.tf`](./deploy/main.tf). It is illustrative, not meant to be
`terraform apply`'d — no state backend, secrets management, or HTTPS/ACM
config is wired up, since the assignment explicitly scoped out production
hardening.

## Repository Structure

```
.
├── backend/           # Express API + SQLite + cron-based pinger
│   ├── server.js
│   ├── db.js
│   ├── monitor.js
│   ├── package.json
│   └── Dockerfile
├── frontend/           # Static dashboard (vanilla JS, no build step)
│   ├── index.html
│   └── Dockerfile
├── deploy/
│   └── main.tf          # Hypothetical Terraform deployment sketch
├── screenshots/          # Evidence of UP/DOWN states for grading
├── docker-compose.yml
├── AI_LOG.md             # AI collaboration log (required deliverable)
└── README.md
```
