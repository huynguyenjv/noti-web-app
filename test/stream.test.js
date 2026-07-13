const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('GET /api/stream proxies SSE events and forwards userId', async () => {
  let seenUrl = '';
  const stub = http.createServer((req, res) => {
    seenUrl = req.url;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: notification\ndata: {"title":"PAYMENT_FAILED","body":"hi"}\n\n');
    res.end();
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/stream?userId=demo-user`);
  const text = await res.text();
  server.close();
  stub.close();

  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  assert.match(text, /event: notification/);
  assert.match(text, /PAYMENT_FAILED/);
  assert.match(seenUrl, /^\/api\/v1\/stream\?/);
  assert.match(seenUrl, /userId=demo-user/);
});

test('GET /api/stream returns 400 on missing userId', async () => {
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/stream`);
  const json = await res.json();
  server.close();

  assert.strictEqual(res.status, 400);
  assert.match(json.error, /userId/i);
});
