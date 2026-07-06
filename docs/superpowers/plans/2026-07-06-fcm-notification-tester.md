# FCM Notification Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small web app to test Firebase Cloud Messaging end-to-end — a browser page that registers for an FCM token and shows incoming notifications, plus a form + backend that sends notifications via the Firebase Admin SDK.

**Architecture:** Node.js + Express serves a static frontend and exposes two JSON endpoints (`GET /api/config`, `POST /api/send`). The frontend uses the Firebase JS SDK (modular v10, loaded from CDN) to obtain a token and receive foreground messages, plus a service worker for background messages. The backend uses `firebase-admin` with a service account to send.

**Tech Stack:** Node.js, Express, firebase-admin, dotenv, Firebase JS SDK v10 (browser, CDN), plain HTML/CSS/JS.

## Global Constraints

- Node.js >= 18 (uses built-in `fetch` in test; native ESM not required — use CommonJS `require` for backend).
- Backend files use CommonJS (`require`/`module.exports`).
- Do NOT commit `.env` or any service account JSON (already in `.gitignore`).
- Web config keys are read from env vars named exactly: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_VAPID_KEY`.
- Service account provided via `GOOGLE_APPLICATION_CREDENTIALS` (path to JSON).
- Server port from `PORT`, default `3000`.
- `/api/send` request/response shapes are fixed (see spec): request `{ target: {type, value}, notification: {title, body}, data? }`; success `{ ok: true, messageId }`; error `{ ok: false, error }`.

---

### Task 1: Project scaffold + Express server serving static files

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `public/index.html`
- Create: `.env.example`
- Test: `test/server.static.test.js`

**Interfaces:**
- Produces: Express app exported from `server.js` as `module.exports = app` (so tests can import without binding a port). Server only calls `app.listen(PORT)` when run directly (`require.main === module`).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "noti-web",
  "version": "1.0.0",
  "description": "FCM notification tester",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "firebase-admin": "^12.3.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the failing test**

Create `test/server.static.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../server');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('GET / serves the index page', async () => {
  const server = await listen(app);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const body = await res.text();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.match(body, /FCM Notification Tester/);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server'`.

- [ ] **Step 5: Write minimal `server.js`**

```js
require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`noti-web listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 6: Write minimal `public/index.html`**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FCM Notification Tester</title>
</head>
<body>
  <h1>FCM Notification Tester</h1>
</body>
</html>
```

- [ ] **Step 7: Write `.env.example`**

```
# Web config (Firebase Console -> Project settings -> General -> Your apps -> Web app)
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
# Cloud Messaging -> Web Push certificates
FIREBASE_VAPID_KEY=

# Service account JSON path (Project settings -> Service accounts -> Generate new private key)
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json

PORT=3000
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json server.js public/index.html .env.example test/server.static.test.js
git commit -m "feat: scaffold express server serving static index"
```

---

### Task 2: `GET /api/config` endpoint

**Files:**
- Modify: `server.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: Express `app` from Task 1.
- Produces: `GET /api/config` → JSON `{ apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey }` read from the `FIREBASE_*` env vars. Values may be empty strings if unset.

- [ ] **Step 1: Write the failing test**

Create `test/config.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_VAPID_KEY = 'test-vapid';

const app = require('../server');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('GET /api/config returns web config from env', async () => {
  const server = await listen(app);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/config`);
  const body = await res.json();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.apiKey, 'test-api-key');
  assert.strictEqual(body.projectId, 'test-project');
  assert.strictEqual(body.vapidKey, 'test-vapid');
  assert.ok('messagingSenderId' in body);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — 404 / missing route, `body.apiKey` undefined.

- [ ] **Step 3: Add the route in `server.js`**

Insert before the `if (require.main === module)` block:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.js test/config.test.js
git commit -m "feat: add GET /api/config endpoint"
```

---

### Task 3: Firebase Admin sender module

**Files:**
- Create: `lib/sender.js`
- Test: `test/sender.test.js`

**Interfaces:**
- Produces:
  - `buildMessage({ target, notification, data })` → returns the object passed to `admin.messaging().send()`. Pure function, no Firebase calls. Throws `Error` with a clear message on invalid input.
    - `target.type === 'token'` → `{ token: target.value, notification, data? }`
    - `target.type === 'topic'` → `{ topic: target.value, notification, data? }`
    - Validation: `target.value` non-empty string, `notification.title` and `notification.body` non-empty strings, `target.type` in `('token','topic')`, `data` (if present) an object of string→string.
  - This module isolates message-shaping logic so it is unit-testable without a live Firebase connection. Actual sending is wired in Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/sender.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildMessage } = require('../lib/sender');

test('builds a token message', () => {
  const msg = buildMessage({
    target: { type: 'token', value: 'abc' },
    notification: { title: 'Hi', body: 'There' },
  });
  assert.deepStrictEqual(msg, {
    token: 'abc',
    notification: { title: 'Hi', body: 'There' },
  });
});

test('builds a topic message with data', () => {
  const msg = buildMessage({
    target: { type: 'topic', value: 'news' },
    notification: { title: 'T', body: 'B' },
    data: { k: 'v' },
  });
  assert.deepStrictEqual(msg, {
    topic: 'news',
    notification: { title: 'T', body: 'B' },
    data: { k: 'v' },
  });
});

test('rejects missing title', () => {
  assert.throws(
    () => buildMessage({ target: { type: 'token', value: 'abc' }, notification: { body: 'B' } }),
    /title/i
  );
});

test('rejects bad target type', () => {
  assert.throws(
    () => buildMessage({ target: { type: 'email', value: 'x' }, notification: { title: 'T', body: 'B' } }),
    /target/i
  );
});

test('rejects non-string data values', () => {
  assert.throws(
    () => buildMessage({
      target: { type: 'token', value: 'abc' },
      notification: { title: 'T', body: 'B' },
      data: { k: 5 },
    }),
    /data/i
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sender.test.js`
Expected: FAIL — `Cannot find module '../lib/sender'`.

- [ ] **Step 3: Write `lib/sender.js` (buildMessage only)**

```js
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function buildMessage({ target, notification, data } = {}) {
  if (!target || !['token', 'topic'].includes(target.type)) {
    throw new Error('Invalid target: type must be "token" or "topic"');
  }
  if (!isNonEmptyString(target.value)) {
    throw new Error('Invalid target: value is required');
  }
  if (!notification || !isNonEmptyString(notification.title)) {
    throw new Error('notification.title is required');
  }
  if (!isNonEmptyString(notification.body)) {
    throw new Error('notification.body is required');
  }

  const message = {
    notification: { title: notification.title, body: notification.body },
  };
  if (target.type === 'token') message.token = target.value;
  else message.topic = target.value;

  if (data !== undefined) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('data must be an object of string keys to string values');
    }
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') {
        throw new Error(`data value for "${k}" must be a string`);
      }
    }
    if (Object.keys(data).length > 0) message.data = data;
  }

  return message;
}

module.exports = { buildMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sender.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sender.js test/sender.test.js
git commit -m "feat: add buildMessage validation for FCM sender"
```

---

### Task 4: Lazy Firebase Admin init + `sendMessage`

**Files:**
- Modify: `lib/sender.js`
- Test: `test/sender.init.test.js`

**Interfaces:**
- Consumes: `buildMessage` from Task 3.
- Produces:
  - `getMessaging()` → lazily initializes `firebase-admin` (using `admin.credential.applicationDefault()`, which reads `GOOGLE_APPLICATION_CREDENTIALS`) exactly once and returns `admin.messaging()`. Throws a clear Error if credentials cannot be loaded.
  - `sendMessage(payload)` → `buildMessage(payload)` then `getMessaging().send(message)`, returns the messageId string. Async.
  - Design: init is lazy so the server (and Task 3's pure tests) run without credentials present; only calling `sendMessage`/`getMessaging` touches Firebase.

- [ ] **Step 1: Write the failing test**

Create `test/sender.init.test.js` — verifies `getMessaging` throws clearly when no credentials are configured:

```js
const { test } = require('node:test');
const assert = require('node:assert');

// Ensure no ambient credentials for this test.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const { getMessaging } = require('../lib/sender');

test('getMessaging throws a clear error without credentials', () => {
  assert.throws(() => getMessaging(), /credential|GOOGLE_APPLICATION_CREDENTIALS|Firebase/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sender.init.test.js`
Expected: FAIL — `getMessaging is not a function`.

- [ ] **Step 3: Add init + send to `lib/sender.js`**

Add near the top, after the `require`-free helpers:

```js
const admin = require('firebase-admin');

let messagingInstance = null;

function getMessaging() {
  if (messagingInstance) return messagingInstance;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Firebase credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.'
    );
  }
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  messagingInstance = admin.messaging();
  return messagingInstance;
}

async function sendMessage(payload) {
  const message = buildMessage(payload);
  return getMessaging().send(message);
}
```

Update the export line:

```js
module.exports = { buildMessage, getMessaging, sendMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sender.init.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all prior tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sender.js test/sender.init.test.js
git commit -m "feat: add lazy firebase-admin init and sendMessage"
```

---

### Task 5: `POST /api/send` endpoint

**Files:**
- Modify: `server.js`
- Test: `test/send.test.js`

**Interfaces:**
- Consumes: `sendMessage` from Task 4, Express `app`.
- Produces: `POST /api/send` handler.
  - On `buildMessage` validation error → 400 `{ ok: false, error }`.
  - On send failure (bad token, no creds) → 500 `{ ok: false, error }`.
  - On success → 200 `{ ok: true, messageId }`.
  - To keep the handler testable without live Firebase, `server.js` requires `sendMessage` from `lib/sender`; the test injects validation failures (missing fields) which fail before any Firebase call.

- [ ] **Step 1: Write the failing test**

Create `test/send.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../server');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function post(port, body) {
  return fetch(`http://127.0.0.1:${port}/api/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/send returns 400 on missing title', async () => {
  const server = await listen(app);
  const { port } = server.address();
  const res = await post(port, {
    target: { type: 'token', value: 'abc' },
    notification: { body: 'no title' },
  });
  const json = await res.json();
  server.close();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(json.ok, false);
  assert.match(json.error, /title/i);
});

test('POST /api/send returns 400 on missing target', async () => {
  const server = await listen(app);
  const { port } = server.address();
  const res = await post(port, { notification: { title: 'T', body: 'B' } });
  const json = await res.json();
  server.close();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(json.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/send.test.js`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Wire the route in `server.js`**

Add `const { sendMessage } = require('./lib/sender');` near the top requires, and add this route before the `if (require.main === module)` block:

```js
app.post('/api/send', async (req, res) => {
  const { target, notification, data } = req.body || {};
  let message;
  try {
    // Validation happens inside sendMessage -> buildMessage; do it explicitly
    // so validation errors map to 400 and send errors map to 500.
    const { buildMessage } = require('./lib/sender');
    message = buildMessage({ target, notification, data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  try {
    const { getMessaging } = require('./lib/sender');
    const messageId = await getMessaging().send(message);
    return res.json({ ok: true, messageId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
```

Note: this uses `buildMessage` + `getMessaging().send` directly (rather than `sendMessage`) precisely so validation vs. send errors get distinct status codes. `sendMessage` remains available for programmatic use.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/send.test.js`
Expected: PASS (both 400 cases).

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server.js test/send.test.js
git commit -m "feat: add POST /api/send endpoint with validation"
```

---

### Task 6: Frontend receive side (token + foreground messages)

**Files:**
- Modify: `public/index.html`
- Create: `public/app.js`
- Create: `public/firebase-messaging-sw.js`

**Interfaces:**
- Consumes: `GET /api/config` (Task 2).
- Produces: browser UI that fetches config, initializes Firebase messaging, registers the service worker, requests permission, gets and displays the token, and logs foreground messages. No automated test (browser + real Firebase required); verified manually in Task 8.

- [ ] **Step 1: Replace `public/index.html` body with the full UI**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FCM Notification Tester</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; }
    section { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
    label { display: block; margin: 0.5rem 0 0.25rem; font-weight: 600; }
    input, textarea, select { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 0.75rem; padding: 0.5rem 1rem; cursor: pointer; }
    #token { word-break: break-all; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; min-height: 1.2rem; }
    #log { background: #111; color: #0f0; font-family: monospace; padding: 0.75rem; border-radius: 4px; height: 200px; overflow: auto; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>FCM Notification Tester</h1>

  <section>
    <h2>1. Nhận (client)</h2>
    <button id="enableBtn">Bật nhận thông báo</button>
    <label>FCM Token</label>
    <div id="token">(chưa có token)</div>
    <button id="copyBtn">Copy token</button>
  </section>

  <section>
    <h2>2. Gửi (server)</h2>
    <label>Target type</label>
    <select id="targetType">
      <option value="token">token</option>
      <option value="topic">topic</option>
    </select>
    <label>Target value (token hoặc topic)</label>
    <input id="targetValue" placeholder="dán token hoặc nhập tên topic" />
    <label>Tiêu đề</label>
    <input id="title" placeholder="Tiêu đề" />
    <label>Nội dung</label>
    <input id="body" placeholder="Nội dung" />
    <label>Data (JSON, tùy chọn)</label>
    <textarea id="data" rows="3" placeholder='{"key":"value"}'></textarea>
    <button id="sendBtn">Gửi notification</button>
  </section>

  <section>
    <h2>Log</h2>
    <div id="log"></div>
  </section>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/app.js`**

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getMessaging,
  getToken,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

const logEl = document.getElementById('token');
const consoleEl = document.getElementById('log');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  consoleEl.textContent += line + '\n';
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

let messaging;
let vapidKey;

async function init() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  if (!cfg.apiKey) {
    log('Lỗi: web config trống. Kiểm tra biến FIREBASE_* trong .env');
    return;
  }
  vapidKey = cfg.vapidKey;
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
  });
  messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    log('📩 Foreground message:', payload.notification || payload.data || payload);
  });
  log('Firebase đã khởi tạo. Bấm "Bật nhận thông báo".');
}

document.getElementById('enableBtn').addEventListener('click', async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      log('Quyền thông báo bị từ chối:', permission);
      return;
    }
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) {
      logEl.textContent = token;
      log('✅ Lấy token thành công.');
    } else {
      log('Không lấy được token.');
    }
  } catch (err) {
    log('Lỗi getToken:', err.message);
  }
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const t = logEl.textContent;
  if (t && t !== '(chưa có token)') {
    await navigator.clipboard.writeText(t);
    log('Đã copy token.');
  }
});

document.getElementById('sendBtn').addEventListener('click', async () => {
  const payload = {
    target: {
      type: document.getElementById('targetType').value,
      value: document.getElementById('targetValue').value.trim(),
    },
    notification: {
      title: document.getElementById('title').value,
      body: document.getElementById('body').value,
    },
  };
  const dataRaw = document.getElementById('data').value.trim();
  if (dataRaw) {
    try {
      payload.data = JSON.parse(dataRaw);
    } catch {
      log('Lỗi: Data không phải JSON hợp lệ.');
      return;
    }
  }
  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) log('✅ Gửi thành công. messageId:', json.messageId);
    else log('❌ Gửi lỗi:', json.error);
  } catch (err) {
    log('❌ Lỗi mạng:', err.message);
  }
});

init();
```

- [ ] **Step 3: Write `public/firebase-messaging-sw.js`**

The service worker cannot read `/api/config` easily at install time, so it fetches config then initializes. It uses the compat build (service workers can't use ES module imports in all browsers; `importScripts` with the compat SDK is the reliable path).

```js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function start() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  firebase.initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || 'Notification';
    const body = (payload.notification && payload.notification.body) || '';
    self.registration.showNotification(title, { body });
  });
}

start();
```

- [ ] **Step 4: Manual smoke check (no Firebase needed)**

Run: `npm start` then open `http://localhost:3000`.
Expected: page renders both sections and the log shows either "Firebase đã khởi tạo" (if config set) or the "web config trống" error (if `.env` empty). No JS console crashes on load.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/firebase-messaging-sw.js
git commit -m "feat: add frontend receive UI, sender form, and service worker"
```

---

### Task 7: README with setup instructions

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: human setup docs. No test.

- [ ] **Step 1: Write `README.md`**

````markdown
# FCM Notification Tester

Web nhỏ để test Firebase Cloud Messaging: lấy FCM token trong trình duyệt, nhận noti (foreground + background), và gửi noti qua backend dùng Firebase Admin SDK.

## Yêu cầu
- Node.js >= 18
- Một Firebase project có bật Cloud Messaging

## Cài đặt
```bash
npm install
cp .env.example .env
```

Điền `.env`:
- `FIREBASE_*`: Firebase Console → Project settings → General → Your apps → Web app config.
- `FIREBASE_VAPID_KEY`: Project settings → Cloud Messaging → Web Push certificates → Key pair.
- `GOOGLE_APPLICATION_CREDENTIALS`: đường dẫn tới service account JSON (Project settings → Service accounts → Generate new private key).

## Chạy
```bash
npm start
```
Mở http://localhost:3000

## Cách test
1. Bấm **Bật nhận thông báo**, cho phép quyền → token hiện ra, bấm **Copy token**.
2. Dán token vào ô **Target value**, nhập tiêu đề + nội dung, bấm **Gửi notification**.
3. Tab đang mở → noti hiện trong Log (foreground). Ẩn/đóng tab rồi gửi lại → noti hệ điều hành (background qua service worker).

## Lưu ý
- Cần chạy trên `localhost` hoặc HTTPS (yêu cầu của service worker + FCM web).
- Không commit `.env` hay service account JSON.

## Test
```bash
npm test
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage"
```

---

### Task 8: End-to-end manual verification (requires real Firebase)

**Files:** none (verification only).

**Interfaces:** exercises the whole system.

- [ ] **Step 1:** Ensure `.env` filled with a real Firebase web config, vapid key, and service account. Run `npm start`.
- [ ] **Step 2:** Open `http://localhost:3000`, click **Bật nhận thông báo**, grant permission, confirm a token appears.
- [ ] **Step 3:** Copy token into the send form, set title/body, click **Gửi notification**. Confirm Log shows `✅ Gửi thành công` with a messageId, and a foreground message appears.
- [ ] **Step 4:** Switch to another tab / minimize, send again, confirm an OS notification appears (background via service worker).
- [ ] **Step 5:** Send with an obviously invalid token; confirm Log shows `❌ Gửi lỗi` with a clear message.

---

## Self-Review Notes

- **Spec coverage:** `/api/config` (Task 2), `/api/send` + validation + status codes (Tasks 3–5), receive token + foreground (Task 6 app.js), background via service worker (Task 6 sw), error handling for permission/token/creds (Tasks 4, 6), env config (Task 1 `.env.example`, Task 7 README), manual E2E test (Task 8). All spec sections mapped.
- **Out of scope respected:** no auth, no DB, no Docker, single project.
- **Type consistency:** `buildMessage`/`getMessaging`/`sendMessage` signatures consistent across Tasks 3–5; `/api/send` shapes match spec; `/api/config` keys match `app.js` and `firebase-messaging-sw.js` usage.
