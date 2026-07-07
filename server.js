require('dotenv').config();
const path = require('path');
const express = require('express');
const { buildMessage, getMessaging } = require('./lib/sender');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

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

firebase.initializeApp(${JSON.stringify(appConfig)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Notification';
  const body = n.body || d.body || '';
  self.registration.showNotification(title, { body });
});
`);
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
