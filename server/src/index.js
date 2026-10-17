require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

// Apply schema on every startup (all statements use IF NOT EXISTS — safe to repeat)
const schemaPath = path.join(__dirname, '../db/schema.sql');
if (fs.existsSync(schemaPath)) {
  db.query(fs.readFileSync(schemaPath, 'utf8'))
    .then(() => console.log('Schema applied.'))
    .catch((err) => console.warn('Schema warning:', err.message));
}

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const clinicRoutes = require('./routes/clinics');
const patientRoutes = require('./routes/patients');
const analyticsRoutes = require('./routes/analytics');
const triageRoutes = require('./routes/triage');
const asrRoutes = require('./routes/asr');
const asrIntakeRoutes = require('./routes/asrIntake');
const asrConversationRoutes = require('./routes/asrConversation');
const ttsPlayRoutes = require('./routes/ttsPlay');
const voiceWebhooks = require('./webhooks/voice');
const { setupClinicSocket } = require('./sockets/clinic');
const { setIo: setVoiceIo } = require('./webhooks/voice');
const { startNotifyBridge } = require('./realtime/notifyBridge');
const mcpClient = require('./mcp/triageClient');

const app = express();
const httpServer = createServer(app);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Parse JSON and URL-encoded bodies (Twilio sends form-encoded)
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.raw({ type: 'application/octet-stream', limit: '25mb' }));

// Make io available to route handlers
app.set('io', io);

// Routes
// NOTE: the Nuktas triage router is mounted FIRST. Several older routers apply
// `router.use(authenticate)` at the router level, which runs for every request
// under /api/v1 (not just their own paths). Mounting triage first keeps its
// service-token endpoints (agent worker callbacks) from being shadowed by that
// blanket user-JWT check.
app.use('/api/v1', triageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1', clinicRoutes);
app.use('/api/v1', patientRoutes);
app.use('/api/v1', analyticsRoutes);
app.use('/api/v1', asrRoutes);
app.use('/api/v1', asrIntakeRoutes);
app.use('/api/v1', asrConversationRoutes);
app.use('/tts-play', ttsPlayRoutes);
app.use('/webhooks/voice', voiceWebhooks);

// Health check
app.get('/health', async (_req, res) => {
  const mcp = await mcpClient.ping();
  res.json({ ok: true, service: 'Nuktas', mcp });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler — Twilio webhooks need TwiML, not JSON
app.use((err, req, res, _next) => {
  console.error(err.stack);
  if (req.path.startsWith('/webhooks/voice')) {
    res.set('Content-Type', 'application/xml');
    return res.status(500).send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, a technical error occurred. Please call back shortly.</Say><Hangup/></Response>'
    );
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO
setupClinicSocket(io);
setVoiceIo(io);

// Bridge Postgres notifications (from the MCP server and any writer) to sockets.
const notifyBridge = startNotifyBridge(io);

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`Nuktas server running on http://localhost:${PORT}`);
});

// Graceful shutdown — stop the bridge and the MCP child cleanly.
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  try { await notifyBridge.stop(); } catch { /* ignore */ }
  try { await mcpClient.close(); } catch { /* ignore */ }
  httpServer.close(() => process.exit(0));
  // Don't hang forever if sockets keep the server open.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
