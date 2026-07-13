const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function stubService(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      calls.push({ url: req.url, method: req.method, body: data });
      handler(req, res);
    });
  });
  return { server, calls };
}

test('GET /api/inbox forwards userId and returns items', async () => {
  const { server: stub, calls } = stubService((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        data: {
          items: [{ id: 'a1', title: 'Hi', body: 'B', read: false }],
          unreadCount: 1,
        },
      })
    );
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/inbox?userId=demo-user`);
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(json.items.length, 1);
  assert.strictEqual(json.items[0].title, 'Hi');
  assert.strictEqual(json.unreadCount, 1);
  assert.match(calls[0].url, /^\/api\/v1\/inbox\?/);
  assert.match(calls[0].url, /userId=demo-user/);
});

test('GET /api/inbox returns 400 on missing userId', async () => {
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/inbox`);
  const json = await res.json();
  server.close();

  assert.strictEqual(res.status, 400);
  assert.strictEqual(json.ok, false);
  assert.match(json.error, /userId/i);
});
