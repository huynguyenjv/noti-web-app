const { test } = require('node:test');
const assert = require('node:assert');
const { buildMessage } = require('../lib/sender');

test('builds a token message', () => {
  const msg = buildMessage({
    target: { type: 'token', value: 'abc' },
    notification: { title: 'Hi', body: 'There' },
  });
  assert.deepStrictEqual(msg, {
    token: 'abc',
    notification: { title: 'Hi', body: 'There' },
  });
});

test('builds a topic message with data', () => {
  const msg = buildMessage({
    target: { type: 'topic', value: 'news' },
    notification: { title: 'T', body: 'B' },
    data: { k: 'v' },
  });
  assert.deepStrictEqual(msg, {
    topic: 'news',
    notification: { title: 'T', body: 'B' },
    data: { k: 'v' },
  });
});

test('rejects missing title', () => {
  assert.throws(
    () => buildMessage({ target: { type: 'token', value: 'abc' }, notification: { body: 'B' } }),
    /title/i
  );
});

test('rejects bad target type', () => {
  assert.throws(
    () => buildMessage({ target: { type: 'email', value: 'x' }, notification: { title: 'T', body: 'B' } }),
    /target/i
  );
});

test('rejects non-string data values', () => {
  assert.throws(
    () => buildMessage({
      target: { type: 'token', value: 'abc' },
      notification: { title: 'T', body: 'B' },
      data: { k: 5 },
    }),
    /data/i
  );
});
