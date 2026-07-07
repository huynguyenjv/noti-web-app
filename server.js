require('dotenv').config();
const path = require('path');
const express = require('express');
const { buildMessage, getMessaging } = require('./lib/sender');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    vapidKey: process.env.FIREBASE_VAPID_KEY || '',
  });
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
