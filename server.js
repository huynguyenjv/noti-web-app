require('dotenv').config();
const path = require('path');
const express = require('express');
const { buildMessage, getMessaging } = require('./lib/sender');
const { buildDeviceRegistration } = require('./lib/register');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
// Base URL of vtrip.core.notification. The frontend can't call it directly (CORS + it needs no
// browser secrets), so this server proxies device registration to it.
const NOTIFICATION_BASE_URL = process.env.NOTIFICATION_BASE_URL || 'http://localhost:8083';

function fcmConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    vapidKey: process.env.FIREBASE_VAPID_KEY || '',
  };
}

app.get('/api/config', (req, res) => {
  res.json(fcmConfig());
});

// Serve the FCM service worker with config injected so firebase.messaging()
// initializes SYNCHRONOUSLY at worker startup. A SW that fetched /api/config
// asynchronously could receive a push before its handler was registered and
// silently drop it.
app.get('/firebase-messaging-sw.js', (req, res) => {
  const cfg = fcmConfig();
  const appConfig = {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
  };
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/');
  res.send(`importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Diagnostic: log every raw push so we can confirm the SW receives it,
// independent of Firebase's onBackgroundMessage handling.
self.addEventListener('push', (event) => {
  let raw = null;
  try { raw = event.data ? event.data.json() : null; }
  catch (e) { raw = event.data ? event.data.text() : '(no data)'; }
  console.log('[SW] push event received:', raw);
});

firebase.initializeApp(${JSON.stringify(appConfig)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] onBackgroundMessage:', payload);
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Notification';
  const body = n.body || d.body || '';
  self.registration.showNotification(title, { body });
});
console.log('[SW] firebase messaging handler installed');
`);
});

// Register this browser's FCM token with the notification service so a PUSH to userId reaches it.
app.post('/api/register-device', async (req, res) => {
  const { userId, token, platform } = req.body || {};
  let body;
  try {
    body = buildDeviceRegistration({ userId, token, platform });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  try {
    const r = await fetch(`${NOTIFICATION_BASE_URL}/api/v1/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authentication': `Bearer eyJhbGciOiJSUzI1NiJ9.eyJ2aWQiOiIzNDRkNjA2Mi00MzFjLTQ3MWEtYjM3Yi01Yzc3N2NmZWQxNjEiLCJzdWIiOiI4Yjk1OTg2ZC1kY2NkLTQ0ZGQtOGJlOS05OTQwYmFjZmQzZDgiLCJhY3RvclR5cGUiOjIsInZjbWlkIjoiIiwiaXNzIjoiZ3QtYXBwIiwiZXhwIjoxNzk2NTUxODA1LCJ2bXQiOiIiLCJpYXQiOjE3NjQ5OTQyMDUsInByb3YiOiJTWVNURU1fUFJPVklERVIifQ.f1KAy5dowZ5_3QcaMKqwxigJp-sbygbQGvZS5MNNcMc7pYpTT1a4-igUJRnYTUlrgD1RuNDMQ0Z1osJlu1rHcnksOFjrTYCW3cQuT5eqYPnbPiuhKAS8ylKJGLdKkxkdxtC3Psb4Mp2e9bO5MoWtHWvAiv3fwm04xF6ImWvp9W_2is7Mfex28X6eocK0M0Bp1_oG0Bw6Y1_rxPa87M-xtqnViA3wGOLyTP4W5c9tG-q0WYXh-FmfzB1kcz5qdNuNUR2EIOcAiyZMyL5unRx0qp-FWQfBRr4t7hVpy5MG5RsTEZP2K-WMtpeI348RgpMA6fbOYn1xbziI9wwx-HVfnA` },
      body: JSON.stringify(body),
    });
    if (r.status === 201) return res.json({ ok: true });
    const text = await r.text();
    return res
      .status(502)
      .json({ ok: false, error: `notification service responded ${r.status}: ${text}` });
  } catch (err) {
    return res.status(502).json({ ok: false, error: `cannot reach notification service: ${err.message}` });
  }
});

app.post('/api/send', async (req, res) => {
  const { target, notification, data } = req.body || {};
  let message;
  try {
    // Validation happens inside sendMessage -> buildMessage; do it explicitly
    // so validation errors map to 400 and send errors map to 500.
    message = buildMessage({ target, notification, data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  try {
    const messageId = await getMessaging().send(message);
    return res.json({ ok: true, messageId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`noti-web listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
