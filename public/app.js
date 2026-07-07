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
