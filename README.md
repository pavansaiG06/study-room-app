# StudyHub - 3D Virtual Co-Working & Study Room Platform

A modern, real-time virtual co-working workspace with 3D cosmic graphics, peer-to-peer audio/video calls, screen sharing, synchronized focus timers, tasks, notes, alarms, and social study rooms.

Designed specifically for **20–30 concurrent users** and engineered to run **100% within free tiers** across hosting, database, and real-time networking.

The Website is now live at: https://study-room-app-fkd9.onrender.com/ !!!

---

## 🌟 Features

### 🎥 Real-Time Media & Collaboration
- **Peer-to-Peer Video & Audio:** WebRTC mesh using Google's public STUN servers for $0 server bandwidth overhead.
- **Screen Sharing:** Share presentations, coding tabs, or problem sets with one click.
- **Smart Video Grid:** Automatically rearranges dynamically from 1 to 6+ participants.
- **Audio Meters:** Visual indicators when participants speak.

### ⏱️ Synchronized Study Rooms
- **Synchronized Focus Sessions:** Server-authoritative Pomodoro countdown visible to all room members in real time.
- **Public & Private Rooms:** Create open study lounges or password-protected private rooms with invite codes.
- **Live Room Chat:** Real-time in-room messaging with system join/leave event logs.
- **Live Presence & Host Promotion:** Real-time heartbeat tracking with automatic host promotion when a creator leaves.

### 🛠️ Personal Productivity Suite
- **Tasks & To-Dos:** Persisted checklist with completion tracking and daily progress meters.
- **Study Notes:** Continuous autosaving markdown scratchpad.
- **Pomodoro Timer:** Individual work & break timer with synthesized audio chimes.
- **Daily Alarms:** Repeating local alarms with browser audio alerts.
- **Friends & Social:** Search users, send friend requests, accept/decline, and view study partners.
- **Customizable Workspace:** Toggle between the 3D animated Three.js particle starfield or upload your own compressed workspace wallpaper.

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Three.js
- **Backend:** Node.js, Express, Socket.IO
- **Database:** SQLite (WAL mode) with `sqlite3` — zero configuration, stored in `/data/studyhub.db`
- **Real-Time Signaling:** Socket.IO relaying WebRTC session descriptions (SDP offers/answers) & ICE candidates
- **Authentication:** JWT tokens + bcrypt password hashing + 1-Click Guest Mode

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 18+ (tested on Node 20 & 24)
- npm or pnpm

### 1. Installation
Install both server and client dependencies:
```bash
npm run install:all
```

### 2. Build the Client
```bash
npm run build
```

### 3. Start the Server
```bash
npm start
```
Open your browser and navigate to **`http://localhost:3000`**.

> **Development Mode:** If modifying client code with hot-reload, run `npm run dev:client` in one terminal and `npm run dev:server` in another.

---

## ☁️ 100% Free Production Deployment

Because the application is packaged as a unified container where Express serves both the API, WebSockets, and static client assets on a single port, you can deploy it to any free host without complex CORS or separate hosting.

### Option A: Render.com (Recommended Free Web Service)
1. Push this repository to GitHub.
2. Sign in to [Render.com](https://render.com) (free account).
3. Click **New +** $\rightarrow$ **Web Service** $\rightarrow$ Connect your repository.
4. Configure the settings:
   - **Environment:** `Node`
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
5. Click **Create Web Service**. Render gives you a free HTTPS URL with automatic WebSocket support!

### Option B: Koyeb / Railway / Fly.io
Deploy using the included `Dockerfile`:
```bash
docker build -t studyhub .
docker run -p 3000:3000 -v studyhub-data:/app/data studyhub
```

---

## 🔒 Free STUN / TURN Setup

The app is pre-configured with Google's free STUN servers:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

If you have users behind strict symmetric enterprise firewalls, you can add free TURN relay credentials from [Metered.ca](https://www.metered.ca/tools/openrelay/) or [OpenRelay](https://www.metered.ca/openrelay/) into your environment variables:
```env
TURN_URL=turn:standard.relay.metered.ca:80
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-credential
```

---

## 📄 License
MIT License. Free for educational and personal use.
