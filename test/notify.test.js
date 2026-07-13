const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { buildNotificationRequest } = require('../lib/notify');

// --- pure builder ---

test('buildNotificationRequest fills sensible defaults', () => {
  const body = buildNotificationRequest({ recipientId: 'demo-user' });
  assert.strictEqual(body.recipientId, 'demo-user');
  assert.deepStrictEqual(body.channels, ['PUSH']);
  assert.strictEqual(body.type, 'BOOKING_CONFIRMED');
  assert.strictEqual(body.templateCode, 'booking_confirmed');
  assert.strictEqual(body.locale, 'vi');
  assert.strictEqual(body.priority, 'HIGH');
  assert.match(body.eventRef, /.+/); // auto-generated
});

test('buildNotificationRequest honors overrides', () => {
  const body = buildNotificationRequest({
    recipientId: 'u1',
    channels: ['PUSH', 'INAPP'],
    templateCode: 'my_tpl',
    type: 'PAYMENT_OK',
    eventRef: 'order-9',
    data: { name: 'An' },
  });
  assert.deepStrictEqual(body.channels, ['PUSH', 'INAPP']);
  assert.strictEqual(body.templateCode, 'my_tpl');
  assert.strictEqual(body.type, 'PAYMENT_OK');
  assert.strictEqual(body.eventRef, 'order-9');
  assert.deepStrictEqual(body.data, { name: 'An' });
});

test('buildNotificationRequest rejects missing recipientId', () => {
  assert.throws(() => buildNotificationRequest({}), /recipientId/i);
});

test('buildNotificationRequest rejects invalid recipientId charset', () => {
  assert.throws(() => buildNotificationRequest({ recipientId: 'bad id!' }), /recipientId/i);
});

test('buildNotificationRequest rejects bad templateCode (must be lowercase)', () => {
  assert.throws(
    () => buildNotificationRequest({ recipientId: 'u1', templateCode: 'BadCode' }),
    /templateCode/i
  );
});

test('buildNotificationRequest rejects empty channels', () => {
  assert.throws(() => buildNotificationRequest({ recipientId: 'u1', channels: [] }), /channel/i);
});

test('buildNotificationRequest rejects invalid locale', () => {
  assert.throws(() => buildNotificationRequest({ recipientId: 'u1', locale: 'vietnam' }), /locale/i);
});

test('buildNotificationRequest rejects invalid priority', () => {
  assert.throws(() => buildNotificationRequest({ recipientId: 'u1', priority: 'URGENT' }), /priority/i);
});

test('buildNotificationRequest accepts locale vi_VN and priority BULK', () => {
  const body = buildNotificationRequest({ recipientId: 'u1', locale: 'vi_VN', priority: 'BULK' });
  assert.strictEqual(body.locale, 'vi_VN');
  assert.strictEqual(body.priority, 'BULK');
});

// --- proxy route ---

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('POST /api/notify forwards to the notification service ingest', async () => {
  const received = [];
  const stub = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      received.push({ url: req.url, method: req.method, body: JSON.parse(data) });
      res.statusCode = 202;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { status: 'QUEUED' } }));
    });
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipientId: 'demo-user' }),
  });
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].url, '/api/v1/notification');
  assert.strictEqual(received[0].body.recipientId, 'demo-user');
  assert.deepStrictEqual(received[0].body.channels, ['PUSH']);
});

test('POST /api/notify returns 400 on missing recipientId', async () => {
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  server.close();

  assert.strictEqual(res.status, 400);
  assert.strictEqual(json.ok, false);
  assert.match(json.error, /recipientId/i);
});
