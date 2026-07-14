const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { buildTemplateRequest } = require('../lib/template');

// --- pure builder ---

test('buildTemplateRequest builds a minimal PUSH template', () => {
  const req = buildTemplateRequest({ code: 'promo_sale', channel: 'PUSH', body: 'Hi' });
  assert.deepStrictEqual(req, { code: 'promo_sale', channel: 'PUSH', body: 'Hi' });
});

test('buildTemplateRequest includes optional locale/subject/providerRef when given', () => {
  const req = buildTemplateRequest({
    code: 'welcome',
    channel: 'EMAIL',
    locale: 'vi',
    subject: 'Chào',
    body: 'Xin chào',
  });
  assert.strictEqual(req.locale, 'vi');
  assert.strictEqual(req.subject, 'Chào');
});

test('buildTemplateRequest rejects bad code', () => {
  assert.throws(() => buildTemplateRequest({ code: 'Bad Code', channel: 'PUSH', body: 'x' }), /code/i);
});

test('buildTemplateRequest rejects invalid channel', () => {
  assert.throws(() => buildTemplateRequest({ code: 'c', channel: 'WHATSAPP', body: 'x' }), /channel/i);
});

test('buildTemplateRequest rejects empty body', () => {
  assert.throws(() => buildTemplateRequest({ code: 'c', channel: 'PUSH', body: '' }), /body/i);
});

test('buildTemplateRequest requires subject for EMAIL', () => {
  assert.throws(() => buildTemplateRequest({ code: 'c', channel: 'EMAIL', body: 'x' }), /subject/i);
});

test('buildTemplateRequest requires providerTemplateRef for ZALO_ZNS', () => {
  assert.throws(
    () => buildTemplateRequest({ code: 'c', channel: 'ZALO_ZNS', body: 'x' }),
    /providerTemplateRef/i
  );
});

// --- proxy routes ---

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('POST /api/templates forwards create and returns the created template', async () => {
  const calls = [];
  const stub = http.createServer((req, res) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      calls.push({ url: req.url, method: req.method, body: d });
      res.statusCode = 201;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { id: 'tpl-1', code: 'promo_sale', approvalStatus: 'DRAFT' } }));
    });
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'promo_sale', channel: 'PUSH', body: 'Hi' }),
  });
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(json.template.id, 'tpl-1');
  assert.strictEqual(json.template.approvalStatus, 'DRAFT');
  assert.strictEqual(calls[0].url, '/api/v1/templates');
  assert.strictEqual(calls[0].method, 'POST');
});

test('GET /api/templates lists all templates', async () => {
  const stub = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        data: [
          { id: 't1', code: 'a', channel: 'PUSH', approvalStatus: 'ACTIVE' },
          { id: 't2', code: 'b', channel: 'INAPP', approvalStatus: 'DRAFT' },
        ],
      })
    );
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/templates`);
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(json.templates.length, 2);
  assert.strictEqual(json.templates[0].code, 'a');
});

test('POST /api/templates/:id/:action forwards lifecycle action', async () => {
  const calls = [];
  const stub = http.createServer((req, res) => {
    calls.push({ url: req.url, method: req.method });
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: null }));
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.NOTIFICATION_BASE_URL = `http://127.0.0.1:${stub.address().port}`;

  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/templates/tpl-1/approve`, { method: 'POST' });
  const json = await res.json();
  server.close();
  stub.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(calls[0].url, '/api/v1/templates/tpl-1/approve');
  assert.strictEqual(calls[0].method, 'POST');
});

test('POST /api/templates/:id/:action rejects unknown action', async () => {
  const app = require('../server');
  const server = await listen(app);
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/templates/tpl-1/destroy`, { method: 'POST' });
  const json = await res.json();
  server.close();

  assert.strictEqual(res.status, 400);
  assert.match(json.error, /action/i);
});
