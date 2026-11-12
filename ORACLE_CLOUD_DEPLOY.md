# StudyHub — 100% Free Always-On Production Deployment Guide (Oracle Cloud + SQLite)

StudyHub is packaged as a unified Node.js + Express + Socket.IO server (`server/index.js`) that serves the built React frontend (`client/dist`), WebSocket signaling, REST APIs, and local SQLite database (`data/studyhub.db`) on a single port (`3000`).

---

## 1. Are There Any Other "Always-On Forever + Free" Cloud Options Besides Oracle?

Standard free PaaS/serverless platforms do **not** satisfy "always-on forever + free + persistent local SQLite disk":

| Provider | Always-On (No Sleep)? | Free Duration | Core Specs / Limits | Verdict for StudyHub |
| :--- | :--- | :--- | :--- | :--- |
| **Oracle Cloud Always Free (OCI)** | **Yes (24/7)** | **Lifetime** | Up to **2–4 OCPUs / 12–24 GB RAM** (ARM Ampere A1) *or* **2x AMD Micro VMs** (`1 GB RAM` each), **200 GB** block storage, **10 TB/mo** outbound bandwidth | **Best Choice** — Handles Node build, Socket.IO, and local SQLite easily with massive bandwidth headroom |
| **Google Cloud (`e2-micro`)** | **Yes (24/7)** | **Lifetime** | **1x `e2-micro`** (`1 GB RAM`), **30 GB** Standard Persistent Disk, **US-only regions** (`us-west1`, `us-central1`, `us-east1`), **1 GB/mo egress limit** | Viable backup only for tiny personal traffic; exceeding 1 GB/month egress or using default SSD triggers charges |
| **AWS EC2 Free Tier** | Yes while active | **12 Months Only** | `t2.micro` / `t3.micro` + 30 GB EBS | Converts to paid hourly billing after 1 year |
| **Azure** | No perpetual VPS | 30-day / 12-month trials | Trial credits & limited tests | Not suitable for free forever hosting |
| **Koyeb Hobby** | **No** (sleeps after 1h idle) | Lifetime | 0.1 vCPU, 512 MB RAM, no persistent volumes | Cold starts + local SQLite resets unless paired with remote DB |
| **Render Free** | **No** (sleeps after 15m idle) | Lifetime (Web) | Free container sleeps + wipes local disk on restart; free Postgres expires in **90 days** | Needs external DB (e.g., Turso free tier) & suffers ~50s cold starts |
| **Fly.io** | N/A | Trial only | New accounts get a 7-day / $1 trial; card billing thereafter | No longer free permanently |

**Conclusion:** **Oracle Cloud Always Free (OCI)** and **Google Cloud Always Free (`e2-micro`)** are the only two major true 24/7 always-on VPS free tiers with persistent disks, and **Oracle Cloud** is strongly preferred because of its **10 TB/month free egress** (vs. Google’s 1 GB/month) and larger RAM/disk headroom.

---

## 2. Why HTTPS Is Required for Video & Audio Calls

Browsers **block camera and microphone access (`navigator.mediaDevices.getUserMedia`)** on public websites served over plain `http://` (anything other than `localhost`).  
In this guide we place **Caddy** in front of Node.js (`localhost:3000`): Caddy automatically issues and renews a **free Let's Encrypt HTTPS certificate** and proxies WebSocket/Socket.IO upgrades seamlessly.

If you don't own a paid domain, you can use a **free domain** from DuckDNS (`yourname.duckdns.org`) or `sslip.io` (`<your-vm-ip>.sslip.io`).

---

## 3. Step-by-Step Oracle Cloud (OCI) Setup

### Quick Automated Setup (Using Included Repo Deployment Files)

This repository includes ready-to-use deployment files:
- [`deploy/oracle-setup.sh`](deploy/oracle-setup.sh) — Automated Ubuntu setup script (installs Node 20, PM2, Caddy, SQLite build tools, opens `iptables`, builds `client/dist`, schedules daily backups).
- [`ecosystem.config.cjs`](ecosystem.config.cjs) — PM2 process configuration (`fork` mode to preserve in-memory Socket.IO/WebRTC room state + WAL shutdown safety).
- [`deploy/Caddyfile.example`](deploy/Caddyfile.example) — Ready-to-copy Caddy HTTPS + WebSocket reverse proxy configuration.
- [`Dockerfile`](Dockerfile) & [`docker-compose.yml`](docker-compose.yml) — Optional ARM64/AMD64 containerized deployment with persistent `/app/data` volume.

If you still prefer running step-by-step manually (or inspecting what the script does), follow Sections 3–5 below.

---

### Step 1: Create Your Oracle Cloud Always Free VM
1. Sign up for an [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) account (a valid card is used for identity verification; staying inside **Always Free** shapes incurs $0 charges).
2. In OCI Console go to **Compute → Instances → Create Instance**:
   - **Name**: `studyhub-server`
   - **Image**: **Ubuntu 24.04 Minimal** (or **Ubuntu 22.04**)
   - **Shape** *(click Change Shape → Specialty and previous generation / Ampere)*:
     - **Option A (Recommended)**: `Ampere` → `VM.Standard.A1.Flex` (**Always Free-eligible**, e.g., `2 OCPUs`, `12 GB RAM`).
     - **Option B (Fallback if A1 reports "Out of Capacity" in your region)**: `AMD` → `VM.Standard.E2.1.Micro` (**Always Free-eligible**, `1 GB RAM`). *(If using 1 GB RAM, also add a 2 GB swap file in Step 3 so `npm run build` never runs out of memory.)*
   - **Networking**: Ensure **Assign a public IPv4 address** is selected.
   - **SSH Keys**: Download the **Private Key (`.key`)** and save it safely on your computer before clicking **Create**.
3. Wait until the instance turns **Running** and copy its **Public IP Address** (e.g., `129.154.xx.xx`).

---

### Step 2: Open Ports `80` and `443` in OCI Cloud Firewall (VCN Security List)
Oracle blocks HTTP/HTTPS ports by default until opened in **both** the OCI Security List and Ubuntu's local firewall:
1. On your Instance details page, click your **Subnet** link → click the **Default Security List**.
2. Under **Ingress Rules**, click **Add Ingress Rules** and add:
   - **Stateless**: Unchecked
   - **Source Type**: `CIDR`
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
   - Click **Add Ingress Rules**.

---

### Step 3: SSH Into the Server & Prepare Ubuntu
From PowerShell / Terminal on your computer (`chmod 400` on Linux/macOS, or Windows OpenSSH):
```bash
ssh -i /path/to/your-oci-private.key ubuntu@<YOUR_PUBLIC_IP>
```

Once logged into Ubuntu:

#### 3A. Open Ubuntu Local Firewall (`iptables` / `ufw`)
OCI Ubuntu images enforce strict `iptables` rules by default. Open ports 80 and 443 and persist them:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential python3 sqlite3 iptables-persistent

# Allow HTTP (80) and HTTPS (443)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
*(If `ufw` is active on your image, also run `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`.)*

#### 3B. Optional Swap File (Required Only on 1 GB AMD Micro VMs)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### 3C. Install Node.js 20 LTS & PM2 Process Manager
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v && npm -v
```

---

### Step 4: Upload Code, Configure `.env`, Build & Database Setup

#### 4A. Get Your Code Onto the Server
Push your project to GitHub (make sure `.env` and `data/*.db` are kept out of Git — `.gitignore` already excludes them) and clone it on the VM, **or** copy files directly via `scp`:
```bash
cd /home/ubuntu
git clone https://github.com/<your-username>/<your-repo>.git study-room-app
cd study-room-app
```

#### 4B. Create Production `.env`
```bash
nano .env
```
Paste and customize:
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=paste-a-64-char-random-secret-here
DATABASE_PATH=./data/studyhub.db
ADMIN_EMAIL=saip73535@gmail.com

# Optional free TURN relay (only needed if users are behind strict corporate firewalls)
# Get free TURN credentials from https://www.metered.ca/tools/openrelay/
# TURN_URL=turn:standard.relay.metered.ca:80
# TURN_USERNAME=your-turn-username
# TURN_CREDENTIAL=your-turn-credential
```
Generate a strong `JWT_SECRET` right in terminal if you want:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### 4C. Install Dependencies & Build Frontend
```bash
npm run install:all
npm run build
```
*(Because `package.json` configures `"allowScripts": { "sqlite3@6.0.1": true }`, `sqlite3` installs/compiles cleanly on Ubuntu ARM64 and x86_64 thanks to `build-essential` and `python3` installed above.)*

#### 4D. Database Setup (`SQLite WAL Mode`)
You do **not** need to run external database servers or manual SQL migration scripts:
- Ensure the data folder exists (`mkdir -p /home/ubuntu/study-room-app/data`).
- When StudyHub starts (`node server/index.js`), [`server/db.js`](server/db.js) automatically:
  1. Creates `./data/studyhub.db` (or the path in `DATABASE_PATH`).
  2. Enables `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, and `PRAGMA foreign_keys = ON;`.
  3. Creates and migrates all tables (`users`, `tasks`, `notes`, `rooms`, `favourite_rooms`, `room_memberships`, `room_roles`, `room_bans`, `room_join_requests`, `friendships`, `direct_messages`, `notifications`, `reports`, `user_warnings`, `admin_audit_logs`, `system_announcements`).
- **Migrating Existing Local Data (Optional)**: If you want to bring your local users/rooms from Windows into Oracle Cloud, stop your local app cleanly and `scp` your local `data/studyhub.db` into `/home/ubuntu/study-room-app/data/studyhub.db` before starting PM2.

---

### Step 5: Run 24/7 with PM2 (Auto-Restart on Crash & Server Reboot)
```bash
cd /home/ubuntu/study-room-app
pm2 start server/index.js --name studyhub
pm2 save
pm2 startup
```
*(Run the exact `sudo env PATH=...` command that `pm2 startup` outputs so StudyHub restarts automatically if Oracle reboots the VM.)*

Verify it is running and healthy locally on the VM:
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":...,"timestamp":...}
```

---

### Step 6: Point a Free Domain & Enable Automatic HTTPS + WebSockets (Caddy)

#### 6A. Get a Free Subdomain
- **Fastest (Zero Signup)**: Use `<YOUR-PUBLIC-IP>.sslip.io` replacing dots with dashes, or dots directly — e.g., `129-154-10-20.sslip.io`.
- **Custom Name (Free)**: Register at [DuckDNS.org](https://www.duckdns.org/), create `mystudyhub.duckdns.org`, and point it to `<YOUR_PUBLIC_IP>`.

#### 6B. Install Caddy & Configure Reverse Proxy
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:
```bash
sudo nano /etc/caddy/Caddyfile
```
Replace contents with (swap `mystudyhub.duckdns.org` with your domain or `<ip>.sslip.io`):
```caddyfile
mystudyhub.duckdns.org {
    encode gzip
    reverse_proxy localhost:3000
}
```
*(Caddy automatically handles HTTPS Let's Encrypt certificates AND proxies Socket.IO WebSocket `Upgrade` headers without extra configuration!)*

Restart Caddy and verify:
```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy
```

Open **`https://mystudyhub.duckdns.org`** in your browser — camera, mic, screen sharing, Socket.IO rooms, and SQLite persistence will now run 24/7 over HTTPS!

---

## 4. Automated Daily Database Backups & Anti-Idle Maintenance

### Automated SQLite Backup (Safe While Running in WAL Mode)
Create a safe daily backup cron job using SQLite's online `.backup` command:
```bash
mkdir -p /home/ubuntu/backups
crontab -e
```
Add this line to back up `studyhub.db` daily at 03:00 UTC and keep the latest 7 backups:
```cron
0 3 * * * /usr/bin/sqlite3 /home/ubuntu/study-room-app/data/studyhub.db ".backup '/home/ubuntu/backups/studyhub-$(date +\%F).db'" && find /home/ubuntu/backups -type f -mtime +7 -delete
```

### Updating the Live App After Code Changes
```bash
cd /home/ubuntu/study-room-app
git pull
npm run install:all
npm run build
pm2 restart studyhub
```

### Note on Oracle Cloud Idle Instance Reclamation
Oracle Cloud's Always Free policy notes that VMs with near-zero CPU, network, and memory activity over 7 consecutive days may be reclaimed. An active StudyHub Node process + Caddy + periodic checks typically avoids idle reclamation; check **OCI Console → Billing / Cost Management → Usage** occasionally during your first month to confirm `$0.00` usage across all resources.

---

## 5. Free Backup Option: Google Cloud Always Free (`e2-micro`) Summary
If Oracle Cloud denies signup/card verification in your region, Google Cloud's Always Free `e2-micro` is the secondary always-on VPS fallback:
1. Select strictly **`us-west1` (Oregon)**, **`us-central1` (Iowa)**, or **`us-east1` (South Carolina)**.
2. Set machine type to **`e2-micro`** (`1 GB RAM`) and **explicitly change Boot Disk Type to `Standard persistent disk`** (`<= 30 GB`), otherwise Google bills for Balanced/SSD disks.
3. Add the `2 GB` swap file shown in Step 3B, follow Steps 4–6, and keep an eye on Google's **1 GB/month North America egress cap** (avoid uploading huge room cover images repeatedly; avatars/covers are compressed client-side, which helps stay compact).
