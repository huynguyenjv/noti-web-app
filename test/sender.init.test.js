const { test } = require('node:test');
const assert = require('node:assert');

// Ensure no ambient credentials for this test.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const { getMessaging } = require('../lib/sender');

test('getMessaging throws a clear error without credentials', () => {
  assert.throws(() => getMessaging(), /credential|GOOGLE_APPLICATION_CREDENTIALS|Firebase/i);
});
