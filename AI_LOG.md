# AI Collaboration Log

## AI Tech Stack

- Primary assistant: Claude (Sonnet 4.6), via the Claude.ai chat interface. Used across a single continuous session to scaffold the backend API, the frontend dashboard, the Docker orchestration, and the deployment sketch.
- I reviewed every generated file before accepting it, ran the stack locally on Windows with Docker Desktop, debugged the environment issues that came up, and verified the up/down detection logic manually against live URLs before treating it as done.

## The Prompts That Shipped It

1. Backend scaffold:
> "Build a Node.js + Express backend for an uptime monitor MVP. It needs to: let a user register a URL via POST, periodically ping every registered URL on a cron schedule, and store status code, response time, and timestamp for every check in SQLite. Use better-sqlite3 to avoid async driver complexity at this scale. Treat any non-2xx/3xx response, timeout, or connection error as 'down' rather than crashing the check loop."

2. Frontend dashboard:
> "Build a single-file, dependency-free HTML/JS dashboard (no React/build step) that polls a REST API every 5 seconds, lists monitored URLs with an up/down badge, status code, response time, and a 'last checked' relative timestamp. Include a form to add new URLs and a way to remove one. Style it dark-mode, clean, minimal."

3. Docker orchestration:
> "Write a docker-compose.yml that builds the backend and frontend from their own Dockerfiles, exposes the backend on 4000 and frontend on 8080, persists SQLite data in a named volume so it survives container restarts, and starts both with a single `docker compose up`."

4. Deployment sketch:
> "Sketch a lightweight, illustrative Terraform config for deploying this to AWS — ECS Fargate for the backend, S3/CloudFront for the static frontend, RDS as the eventual Postgres upgrade path from SQLite. Not meant to be applied as-is, just to show the topology."

## Course Corrections

Issue 1: Local environment wasn't actually ready to run Docker, and the first error was misleading.
After scaffolding the project, my first attempt to run `docker compose up --build` failed with:

*unable to get image 'uptime-monitor-frontend': failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine*

It wasn't obvious from the error alone whether this was a bug in the generated `docker-compose.yml` or an environment problem. I asked the AI to help diagnose it rather than assuming the compose file was at fault. It correctly identified this as Docker Desktop not actually running (the engine, not the GUI), distinct from Docker not being installed at all — a subtlety I'd have wasted time on by assuming the install itself was broken. The fix was launching Docker Desktop, confirming the engine showed "running" in the tray (not just the app open), and verifying WSL2 was properly set up before retrying. This wasn't a code defect, but it's a good example of the AI helping me read an infra error correctly instead of guessing at it.

**Issue 2: Distinguishing "down" from "broken request" in the ping logic.**
An early version of the health-check logic only treated network-level failures (DNS errors, timeouts, connection refused) as "down," but counted any HTTP response — including a `404` or `500` — as "up," since *a* response had technically arrived. I caught this while testing against `https://httpstat.us/500` style endpoints: the dashboard showed it as UP, which is wrong. I had the logic corrected to explicitly check `res.status >= 200 && res.status < 400` rather than just "did a response arrive," so a URL that resolves but returns a server error is now correctly flagged as DOWN. This is visible in testing today: a URL returning `403` is correctly shown as DOWN with the actual status code, while a URL with no DNS resolution shows DOWN with `N/A`, since no HTTP response existed at all to report a code from.

**Issue 3: SQLite is the right call locally, wrong call if this ever scales past one backend instance.**
When generating the deployment sketch, the first draft of the Terraform config kept SQLite as the database inside the ECS task definition. I pushed back, since SQLite locks the whole file on writes and ECS Fargate tasks don't share a filesystem across replicas by default — that setup would silently break the moment a second backend instance spun up. The corrected sketch documents RDS Postgres as the production upgrade path while keeping SQLite for the local Docker Compose MVP, where a single container is genuinely all that's running and the simplicity is the right tradeoff.

