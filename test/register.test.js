const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { buildDeviceRegistration } = require('../lib/register');

// --- pure builder ---

test('buildDeviceRegistration defaults platform to WEB', () => {
  const body = buildDeviceRegistration({ userId: 'u1', token: 'tok' });
  assert.deepStrictEqual(body, { platform: 'WEB', token: 'tok', userId: 'u1' });
});

test('buildDeviceRegistration accepts explicit platform', () => {
  const body = buildDeviceRegistration({ userId: 'u1', token: 'tok', platform: 'ANDROID' });
  assert.strictEqual(body.platform, 'ANDROID');
});

test('buildDeviceRegistration rejects missing userId', () => {
  assert.throws(() => buildDeviceRegistration({ token: 'tok' }), /userId/i);
});

test('buildDeviceRegistration rejects missing token', () => {
  assert.throws(() => buildDeviceRegistration({ userId: 'u1' }), /token/i);
});

test('buildDeviceRegistration rejects invalid platform', () => {
  assert.throws(
    () => buildDeviceRegistration({ userId: 'u1', token: 'tok', platform: 'DESKTOP' }),
    /platform/i
  );
});

// --- proxy route ---

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('POST /api/register-device forwards to the notification service', async () => {
  const received = [];
  const stub = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      received.push({ url: req.url, method: req.method, body: JSON.parse(data) });
      res.statusCode = 201;
      res.end();
    });
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/register-device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'u1', token: 'tok', platform: 'WEB' }),
  });
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].url, '/api/v1/devices');
  assert.deepStrictEqual(received[0].body, { platform: 'WEB', token: 'tok', userId: 'u1' });
});

test('POST /api/register-device returns 400 on missing userId', async () => {
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/register-device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'tok' }),
  });
  const json = await res.json();
  server.close();

  assert.strictEqual(res.status, 400);
  assert.strictEqual(json.ok, false);
  assert.match(json.error, /userId/i);
});
