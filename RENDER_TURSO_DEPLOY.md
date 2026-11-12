# Deploying StudyHub on Render + Turso (Step-by-Step + Always-Awake Setup)

This project is pre-configured to run **100% free** on **Render** (Node.js web host + WebSockets) + **Turso** (serverless cloud SQLite/libSQL) + **GitHub** (automatic build & deploy on push).

---

## 1. How Render & Turso Work Together

- **Is Turso already built into Render?** **No.** Turso (`turso.tech`) is a separate database service that you create in ~2 minutes (no credit card required). You paste its URL and token into Render's Environment Variables.
- **Why you need Turso on Render Free Tier:** Render's free tier wipes local files on every sleep, restart, or new deploy. Storing everything in Turso ensures **users, study rooms, tasks, notes, friendships, DMs, and reports persist permanently**.
- **Local fallback:** When `TURSO_DATABASE_URL` is not set (like on your Windows PC), `server/db.js` automatically falls back to local `./data/studyhub.db`.

---

## 2. Step-by-Step Setup Guide

### Step 1 — Create Your Turso Cloud Database (~2 Minutes)
1. Go to [turso.tech](https://turso.tech) and click **Sign Up** (you can log in directly with your GitHub account — no card needed).
2. Click **Create Database**:
   - **Database Name:** `studyhub-prod`
   - **Location / Region:** Pick the region closest to where you will host Render (for example, `Virginia / US East` or `Singapore` or `Frankfurt`).
3. Inside your newly created database page, copy two credentials to a temporary notepad:
   - **`TURSO_DATABASE_URL`** — looks like `libsql://studyhub-prod-yourname.aws-us-east-1.turso.io`
   - **`TURSO_AUTH_TOKEN`** — click **Create Token** (choose **Read & Write** access, never expire / long expiry) and copy the token string.

> Never commit `TURSO_AUTH_TOKEN` or `.env` to GitHub!

---

### Step 2 — Push StudyHub to GitHub (Full Step-by-Step)
Render deploys directly from GitHub and automatically rebuilds whenever you push new changes.

1. **Sign up / Sign in** at [github.com](https://github.com).
2. Click the **`+`** icon (top right) -> **New repository**:
   - **Repository name:** `study-room-app`
   - **Visibility:** **Public** or **Private** (both work with Render Free Tier! **Public** also gives unlimited free GitHub Actions minutes if you enable the optional keep-alive backup workflow).
   - Do **not** initialize with README or `.gitignore` (your folder already has them). Click **Create repository**.
3. Open a terminal inside `c:\Users\pavan sai\OneDrive\Desktop\study-room-app` and run:
   ```bash
   git init
   git branch -M main
   git status
   ```
   Confirm `.env`, `node_modules/`, `client/dist/`, and `data/*.db` are **NOT** listed under untracked files (`.gitignore` excludes them automatically).
4. Commit and push to GitHub (replace `YOUR_USERNAME` with your GitHub username):
   ```bash
   git add .
   git commit -m "Initial StudyHub deployment setup for Render and Turso"
   git remote add origin https://github.com/YOUR_USERNAME/study-room-app.git
   git push -u origin main
   ```
   - *(Tip for Windows authentication: when `git push` prompts for login, choose **"Sign in with your browser"** in the Git Credential Manager popup, or sign in via VS Code's GitHub extension.)*

---

### Step 3 — Connect GitHub to Render & Deploy (`render.yaml` Blueprint)
1. Go to [dashboard.render.com](https://dashboard.render.com) and click **Get Started** -> **Continue with GitHub**.
2. Authorize Render to access your GitHub repositories (either **All repositories** or select `study-room-app`).
3. On the Render Dashboard, click **New +** -> **Blueprint**.
4. Select your `study-room-app` repository and click **Connect**.
5. Render automatically reads [render.yaml](render.yaml):
   - **Runtime:** Node (`20.18.0`)
   - **Plan:** Free (`plan: free`)
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - **Auto-Deploy:** `commit` (rebuilds automatically on every `git push`)
6. Fill in the 3 required secret fields Render prompts you for:
   - **`TURSO_DATABASE_URL`**: `libsql://...turso.io` from Step 1
   - **`TURSO_AUTH_TOKEN`**: your Read & Write token from Step 1
   - **`ADMIN_EMAIL`**: your super-admin email (e.g. `saip73535@gmail.com`)
   - *(Render generates `JWT_SECRET` automatically.)*
7. Click **Apply** and wait ~2–4 minutes for the initial build to finish.
8. Verify your live deployment:
   - Open `https://<your-app-name>.onrender.com/health` -> confirm `"status": "ok"` and **`"dbDriver": "turso"`**.
   - Open `https://<your-app-name>.onrender.com/ping` -> confirm `{"status":"pong",...}`.

---

## 3. Preventing Render's 15-Minute Inactivity Spin-Down (Zero Sleep Setup)

Render's Free Tier spins down a web service only if it receives **no inbound external HTTP/WebSocket traffic for 15 minutes**. Once spun down, code *inside* your server cannot wake itself up — you must keep inbound pings arriving cleanly from outside.

StudyHub already includes **3 automatic layers in code**, and **1 quick external pinger** makes it truly 24/7:

### Built Into Your Codebase Already
1. **Zero-DB `/ping` Endpoint (`server/index.js`):** Returns `200 OK` immediately without querying Turso, so pinging every 5 minutes never consumes your Turso row-read quota.
2. **Active-Session Browser Heartbeat (`client/src/context/AuthContext.jsx`):** Every open StudyHub tab pings `/ping` every 8 minutes and retries transient 502/503 responses instead of logging users out.
3. **Socket Auto-Reconnect (`client/src/context/SocketContext.jsx`) + `RENDER_EXTERNAL_URL` Self-Ping (`server/index.js`):** Reconnects Socket.IO automatically across any restart and arms a 9-minute ping to `RENDER_EXTERNAL_URL/ping` while awake.

### Step 4 — Enable the 24/7 External Pinger (Takes 60 Seconds — Required for 0 Users Online)
Pick **one** of these free external monitors (no credit card needed):

#### Option A: UptimeRobot (Recommended — Strict 5-Minute Pings)
1. Go to [uptimerobot.com](https://uptimerobot.com) and create a free account.
2. Click **+ New Monitor**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `StudyHub Render Keep-Alive`
   - **URL (or IP):** `https://<your-app-name>.onrender.com/ping`
   - **Monitoring Interval:** **`5 minutes`**
3. Click **Create Monitor**.
   Because UptimeRobot hits your public Render `/ping` URL every **5 minutes** (well under Render's 15-minute threshold), Render's inactivity timer resets continuously 24/7 — **even with zero visitors** — and alerts you by email if your app ever goes down.

#### Option B: Cron-job.org (Flexible Custom Schedule)
1. Go to [cron-job.org](https://cron-job.org) and sign up free.
2. Click **Create Cronjob**:
   - **URL:** `https://<your-app-name>.onrender.com/ping`
   - **Execution schedule:** **Every 5 minutes** (or every 10 minutes).
3. Save & enable.

#### Option C: Optional GitHub Actions Backup Already Included
We also included [.github/workflows/render-keepalive.yml](.github/workflows/render-keepalive.yml).
- **Note:** GitHub Actions scheduled crons can be delayed 15–30+ minutes during peak traffic and auto-pause after 60 days with no commits, so **do not rely on GitHub Actions alone** — keep UptimeRobot or cron-job.org as your primary pinger.
- If you want to activate the GitHub backup too: in your GitHub repo go to **Settings -> Secrets and variables -> Actions -> Variables -> New repository variable**, name it **`RENDER_PING_URL`**, and set its value to `https://<your-app-name>.onrender.com/ping`. (If left unset, the workflow skips cleanly with zero errors.)

> **Important Free-Tier Hours Check:** Render gives each workspace **750 free instance hours/month**. Running 1 service 24/7 uses ~720–744 hours/month, which **fits inside 750 hours as long as StudyHub is your only running free web service on that Render account**. If you host other services on the same account, pause keep-alive during sleeping hours (e.g., `cron-job.org` schedule) or put second projects on another workspace.

---

## 4. How New Features & Updates Get Deployed Later

Whenever you add a new feature or fix a bug locally:
1. Build & test locally (`npm run build` then `npm start`).
2. Push your changes to GitHub:
   ```bash
   git add .
   git commit -m "Describe your new feature"
   git push origin main
   ```
3. **Render builds & deploys automatically:** Because GitHub is linked with `autoDeployTrigger: commit`, Render pulls your commit automatically, installs any new npm packages, rebuilds `client/dist/`, runs `/health`, and swaps live traffic cleanly with **zero data loss in Turso**.
4. **Automatic database updates:** `server/db.js` checks Turso on startup and automatically applies any `CREATE TABLE IF NOT EXISTS` or missing `ALTER TABLE` columns.
