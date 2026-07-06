require('dotenv').config();
const path = require('path');
const express = require('express');

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`noti-web listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
