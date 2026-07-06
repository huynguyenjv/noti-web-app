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
