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
