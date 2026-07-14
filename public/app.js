import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getMessaging,
  getToken,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

const tokenEl = document.getElementById('token');
const consoleEl = document.getElementById('log');
const userIdEl = document.getElementById('userId');
const sendRecipientEl = document.getElementById('sendRecipient');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  consoleEl.textContent += line + '\n';
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

const globalUserId = () => userIdEl.value.trim();

// Parse JSON an toàn: nếu server trả HTML (vd 404 do chưa restart) thì báo rõ thay vì "Unexpected token <".
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 404) {
      throw new Error('route không tồn tại — server noti-web có thể chưa restart (npm start)');
    }
    throw new Error(`phản hồi không phải JSON (HTTP ${res.status})`);
  }
}

// ---------------------------------------------------------------- Firebase
let messaging;
let vapidKey;

async function init() {
  sendRecipientEl.value = globalUserId(); // recipient mặc định = userId chung
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
  onMessage(messaging, async (payload) => {
    const n = payload.notification || payload.data || {};
    log('📩 Foreground message:', payload.notification || payload.data || payload);
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(n.title || 'Notification', { body: n.body || '' });
    } catch (err) {
      log('Không hiển thị được popup foreground:', err.message);
    }
  });
  log('Firebase đã khởi tạo. Vào tab "Thiết bị" → Bật nhận thông báo.');
}

// ---------------------------------------------------------------- Tabs
const VIEW_TITLES = { device: 'Thiết bị', send: 'Gửi thông báo', template: 'Template' };
const viewTitleEl = document.getElementById('viewTitle');
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (viewTitleEl) viewTitleEl.textContent = VIEW_TITLES[btn.dataset.tab] || '';
  });
});

// -------------------------------------------------- Global userId → clear
userIdEl.addEventListener('input', () => {
  sendRecipientEl.value = globalUserId();
  clearInbox();
  log(`👤 Đổi User ID → "${globalUserId()}". Đã xoá hộp thư đang hiển thị.`);
  if (rtTimer) connectStream(); // realtime đang bật → nối lại theo user mới
});

// ---------------------------------------------------------- Realtime (SSE)
let sse = null;
let rtTimer = null; // keepalive: nối lại định kỳ để refresh presence (TTL 60s phía service)
const rtBtn = document.getElementById('rtBtn');
const rtDot = document.getElementById('rtDot');

function setRt(state) {
  rtDot.className = 'rt-dot ' + state;
  rtBtn.classList.toggle('active', state === 'on');
}

function connectStream() {
  const userId = globalUserId();
  if (!userId) return log('⚠️ Nhập User ID để mở realtime.');
  if (sse) {
    sse.close();
    sse = null;
  }
  setRt('connecting');
  sse = new EventSource(`/api/stream?userId=${encodeURIComponent(userId)}`);
  sse.onopen = () => {
    setRt('on');
    log(`🟢 Realtime online cho "${userId}" — OUTAPP sẽ đến realtime thay vì push.`);
  };
  sse.addEventListener('notification', async (e) => {
    let p = {};
    try {
      p = JSON.parse(e.data);
    } catch {
      /* ignore */
    }
    log(`⚡ Realtime nudge: ${p.title || ''} — ${p.body || ''}`);
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(p.title || 'Realtime', { body: p.body || '' });
    } catch {
      /* SW chưa sẵn sàng */
    }
  });
  sse.onerror = () => setRt('connecting'); // EventSource tự retry
}

function stopRealtime() {
  if (rtTimer) clearInterval(rtTimer);
  rtTimer = null;
  if (sse) {
    sse.close();
    sse = null;
  }
  setRt('off');
}

rtBtn.addEventListener('click', () => {
  if (rtTimer || sse) {
    stopRealtime();
    log('⚪ Realtime offline.');
  } else {
    connectStream();
    rtTimer = setInterval(() => globalUserId() && connectStream(), 45000);
  }
});

// ---------------------------------------------------------------- Device
document.getElementById('enableBtn').addEventListener('click', async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return log('Quyền thông báo bị từ chối:', permission);
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    if (!registration.active) {
      await new Promise((resolve) => {
        const sw = registration.installing || registration.waiting;
        if (!sw) return resolve();
        sw.addEventListener('statechange', () => sw.state === 'activated' && resolve());
      });
    }
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return log('Không lấy được token.');
    tokenEl.textContent = token;
    tokenEl.classList.add('has-token');
    log('✅ Lấy token thành công.');
    await registerDevice(token);
  } catch (err) {
    log('Lỗi getToken:', err.message);
  }
});

async function registerDevice(token) {
  const userId = globalUserId();
  if (!userId) return log('⚠️ Chưa nhập User ID — bỏ qua đăng ký device.');
  try {
    const res = await fetch('/api/register-device', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, token, platform: 'WEB' }),
    });
    const json = await readJson(res);
    if (json.ok) log(`✅ Đã đăng ký device cho user "${userId}".`);
    else log('❌ Đăng ký device lỗi:', json.error);
  } catch (err) {
    log('❌ Lỗi mạng khi đăng ký device:', err.message);
  }
}

document.getElementById('registerBtn').addEventListener('click', () => {
  const token = tokenEl.textContent;
  if (!token || token === 'chưa có token') return log('Chưa có token — Bật nhận thông báo trước.');
  registerDevice(token);
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const t = tokenEl.textContent;
  if (t && t !== 'chưa có token') {
    await navigator.clipboard.writeText(t);
    log('Đã copy token.');
  }
});

// ---------------------------------------------------------------- Send
document.getElementById('sendBtn').addEventListener('click', async () => {
  const recipientId = sendRecipientEl.value.trim();
  const channels = [...document.querySelectorAll('.ch:checked')].map((c) => c.value);
  const type = document.getElementById('sendType').value.trim() || undefined;
  const templateCode = document.getElementById('sendTemplate').value.trim() || undefined;
  const locale = document.getElementById('sendLocale').value || undefined;
  const priority = document.getElementById('sendPriority').value || undefined;
  const eventRef = document.getElementById('sendEventRef').value.trim() || undefined;
  const dataRaw = document.getElementById('sendData').value.trim();

  if (!recipientId) return log('⚠️ Nhập Recipient (User ID).');
  if (!channels.length) return log('⚠️ Chọn ít nhất 1 channel.');

  let data;
  if (dataRaw) {
    try {
      data = JSON.parse(dataRaw);
    } catch {
      return log('❌ Data không phải JSON hợp lệ.');
    }
  }

  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipientId, channels, type, templateCode, locale, priority, eventRef, data }),
    });
    const json = await readJson(res);
    if (json.ok) {
      log(`✅ Đã gửi [${channels.join(',')}] tới "${recipientId}" (eventRef=${json.eventRef}).`);
      // INAPP tới chính user đang xem → cập nhật chuông.
      if (channels.includes('INAPP') && recipientId === globalUserId()) loadInbox();
    } else {
      log('❌ Gửi lỗi:', json.error);
    }
  } catch (err) {
    log('❌ Lỗi mạng:', err.message);
  }
});

// ---------------------------------------------------------------- Bell / inbox
const bellPanel = document.getElementById('bellPanel');
const bellBadge = document.getElementById('bellBadge');
const inboxEl = document.getElementById('inbox');

document.getElementById('bellBtn').addEventListener('click', () => {
  const opening = !bellPanel.classList.contains('open');
  bellPanel.classList.toggle('open', opening);
  if (opening) loadInbox();
});
document.getElementById('inboxRefreshBtn').addEventListener('click', loadInbox);

// Đóng panel khi bấm ra ngoài.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.bell')) bellPanel.classList.remove('open');
});

function clearInbox() {
  inboxEl.innerHTML = '';
  setBadge(0);
}

function setBadge(n) {
  bellBadge.textContent = n;
  bellBadge.classList.toggle('show', n > 0);
}

async function loadInbox() {
  const userId = globalUserId();
  if (!userId) return log('⚠️ Nhập User ID để xem hộp thư.');
  try {
    const res = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}`);
    const json = await readJson(res);
    if (!json.ok) return log('❌ Tải hộp thư lỗi:', json.error);
    renderInbox(json.items);
    setBadge(json.unreadCount || 0);
    log(`📬 Hộp thư "${userId}": ${json.items.length} tin, ${json.unreadCount} chưa đọc.`);
  } catch (err) {
    log('❌ Lỗi mạng khi tải hộp thư:', err.message);
  }
}

function renderInbox(items) {
  inboxEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'inbox-empty';
    empty.textContent = '(hộp thư trống)';
    inboxEl.append(empty);
    return;
  }
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'inbox-item' + (it.read ? '' : ' unread');
    const title = document.createElement('div');
    title.className = 'it-title';
    title.textContent = it.title || '(không tiêu đề)';
    const body = document.createElement('div');
    body.className = 'it-body';
    body.textContent = it.body || '';
    const meta = document.createElement('div');
    meta.className = 'it-meta';
    meta.textContent = `${it.read ? 'đã đọc' : 'chưa đọc'} · ${it.createdAt || ''}`;
    el.append(title, body, meta);
    inboxEl.append(el);
  }
}

// ---------------------------------------------------------------- Template
const tplRows = document.getElementById('tplRows');
const NEXT_ACTION = { DRAFT: 'submit', SUBMITTED: 'approve', APPROVED: 'select' };
const ACTION_LABEL = { submit: 'Submit', approve: 'Approve', select: 'Chọn', deprecate: 'Deprecate' };
let tplLoadedOnce = false;

document.getElementById('tplReloadBtn').addEventListener('click', loadTemplateList);

document.getElementById('tplCreateBtn').addEventListener('click', async () => {
  const bodyReq = {
    code: document.getElementById('tplCode').value.trim(),
    channel: document.getElementById('tplChannel').value,
    locale: document.getElementById('tplLocale').value || undefined,
    subject: document.getElementById('tplSubject').value.trim() || undefined,
    body: document.getElementById('tplBody').value,
    providerTemplateRef: document.getElementById('tplProviderRef').value.trim() || undefined,
  };
  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyReq),
    });
    const json = await readJson(res);
    if (json.ok) {
      log(`✅ Tạo template "${json.template.code}" (${json.template.approvalStatus}).`);
      loadTemplateList();
    } else {
      log('❌ Tạo template lỗi:', json.error);
    }
  } catch (err) {
    log('❌ Lỗi mạng:', err.message);
  }
});

async function loadTemplateList() {
  try {
    const res = await fetch('/api/templates');
    const json = await readJson(res);
    if (!json.ok) return log('❌ Tải danh sách template lỗi:', json.error);
    renderTemplateTable(json.templates);
    tplLoadedOnce = true;
  } catch (err) {
    log('❌ Lỗi mạng:', err.message);
  }
}

async function templateAction(id, action) {
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
    const json = await readJson(res);
    if (json.ok) {
      log(`✅ Template ${action} ok.`);
      loadTemplateList();
    } else {
      log(`❌ ${action} lỗi:`, json.error);
    }
  } catch (err) {
    log('❌ Lỗi mạng:', err.message);
  }
}

function renderTemplateTable(items) {
  tplRows.innerHTML = '';
  if (!items.length) {
    tplRows.innerHTML = '<tr><td colspan="6" class="tpl-empty">Chưa có template nào.</td></tr>';
    return;
  }
  for (const t of items) {
    const tr = document.createElement('tr');

    const td = (cls, text) => {
      const c = document.createElement('td');
      if (cls) c.className = cls;
      c.textContent = text;
      return c;
    };
    tr.append(
      td('c-code', t.code || '?'),
      td('c-ch', t.channel || '?'),
      td('c-loc', t.locale || '-'),
      td('c-ver', 'v' + (t.version ?? '?'))
    );

    const stTd = document.createElement('td');
    const st = document.createElement('span');
    st.className = 'tpl-status st-' + (t.approvalStatus || 'DRAFT');
    st.textContent = t.approvalStatus || 'DRAFT';
    stTd.append(st);
    tr.append(stTd);

    const actTd = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'tpl-actions';
    const next = NEXT_ACTION[t.approvalStatus];
    if (next) {
      const b = document.createElement('button');
      b.className = 'btn btn-primary';
      b.textContent = ACTION_LABEL[next];
      b.onclick = () => templateAction(t.id, next);
      actions.append(b);
    }
    if (t.approvalStatus !== 'DEPRECATED') {
      const d = document.createElement('button');
      d.className = 'btn btn-secondary';
      d.textContent = ACTION_LABEL.deprecate;
      d.onclick = () => templateAction(t.id, 'deprecate');
      actions.append(d);
    }
    actTd.append(actions);
    tr.append(actTd);
    tplRows.append(tr);
  }
}

// Tự nạp danh sách lần đầu mở tab Template.
document.querySelector('.tab[data-tab="template"]').addEventListener('click', () => {
  if (!tplLoadedOnce) loadTemplateList();
});

init();
