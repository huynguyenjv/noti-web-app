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
