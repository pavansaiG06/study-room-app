const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initSocketHandlers } = require('./socket');
const { securityHeaders, createRateLimiter } = require('./security');
const { dbAsync, initDatabase, closeDatabase, isTurso } = require('./db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const noteRoutes = require('./routes/notes');
const roomRoutes = require('./routes/rooms');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Socket.IO configuration with CORS enabled for dev and production
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

// Middleware & Production Security Hardening
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many authentication attempts. Please wait a few minutes.'
});
const writeRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: 'Rate limit exceeded. Please slow down.'
});

app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/guest', authRateLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/rooms', writeRateLimiter, roomRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', writeRateLimiter, reportRoutes);
app.use('/api/admin', adminRoutes);

// Lightweight zero-DB keepalive ping endpoint (prevents Render inactivity spin-down without using Turso reads)
app.get('/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'pong', uptime: process.uptime(), ts: Date.now() });
});

// Health check endpoint (vital for uptime monitors, Docker HEALTHCHECK, and Render probes)
app.get('/health', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await dbAsync.get('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      db: 'connected',
      dbDriver: isTurso ? 'turso' : 'sqlite',
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'error',
      dbDriver: isTurso ? 'turso' : 'sqlite',
      error: err?.message || 'Database check failed',
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  }
});

// WebRTC STUN/TURN configuration endpoint
app.get('/api/webrtc/ice-servers', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ];

  // Optional custom TURN credentials if user provides them via env vars
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({ iceServers });
});

// Static Client Serving
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const legacyPublic = path.join(__dirname, '..', 'public');

if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    })
  );
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.use(express.static(legacyPublic));
}

// Catch unmatched non-GET API routes cleanly
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Initialize WebSockets
initSocketHandlers(io);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
let keepaliveTimer = null;

function startSelfKeepalive() {
  if (process.env.DISABLE_SELF_KEEPALIVE === 'true') return;
  const targetBase = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(targetBase)) return;

  const pingUrl = `${targetBase}/ping`;
  // Ping external URL every 9 minutes while awake as an added keepalive layer
  keepaliveTimer = setInterval(() => {
    fetch(pingUrl, { signal: AbortSignal.timeout(8000) }).catch(() => {});
  }, 9 * 60 * 1000);
  if (keepaliveTimer.unref) keepaliveTimer.unref();
  console.log(`Keepalive self-ping armed for ${pingUrl} (every 9m)`);
}

async function startServer() {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Fatal database startup failure:', err.message);
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    console.log(`StudyHub Server listening on http://${displayHost}:${PORT} (bound to ${HOST}:${PORT})`);
    startSelfKeepalive();
  });
}

if (require.main === module) {
  startServer();
}

// Graceful shutdown for Render / PM2 / Docker
function gracefulShutdown(signal) {
  console.log(`${signal} received — closing server and database connection cleanly...`);
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, startServer };
