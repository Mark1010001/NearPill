import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendEmail, verificationRecipient } from '../email.js';

test('development code delivery uses the test inbox only outside production', () => {
  const email = 'registrant@gmail.com';
  assert.equal(verificationRecipient(email, { DEV_OTP_INBOX: ' nearpillemail@gmail.com ' }), 'nearpillemail@gmail.com');
  assert.equal(verificationRecipient(email, { NODE_ENV: 'production', DEV_OTP_INBOX: 'nearpillemail@gmail.com' }), email);
  assert.equal(verificationRecipient(email, {}), email);
});

test('security email uses Resend and never logs reset links or recipient data', async t => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.MAIL_FROM;
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = originalFrom;
  });
  const warn = t.mock.method(console, 'warn', () => {});
  const error = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }));
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  assert.equal(await sendEmail('test@example.com', 'Test', 'reset-token-secret'), false);
  assert.equal(fetch.mock.calls.length, 0);
  process.env.RESEND_API_KEY = 'test-only-key';
  process.env.MAIL_FROM = 'NearPill <test@example.com>';
  assert.equal(await sendEmail('test@example.com', 'Test', 'reset-token-secret'), true);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.deepEqual(JSON.parse(options.body), {
    from: process.env.MAIL_FROM, to: ['test@example.com'], subject: 'Test', text: 'reset-token-secret',
  });
  fetch.mock.mockImplementation(async () => ({ ok: false, status: 400 }));
  assert.equal(await sendEmail('test@example.com', 'Test', 'reset-token-secret'), false);
  fetch.mock.mockImplementation(async () => { throw new Error('reset-token-secret'); });
  assert.equal(await sendEmail('test@example.com', 'Test', 'reset-token-secret'), false);
  const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls].map(call => call.arguments));
  assert.doesNotMatch(logged, /reset-token-secret|test@example\.com|test-only-key/);
});
