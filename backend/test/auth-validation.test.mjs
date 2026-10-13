import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { validateAuthInput, handleAuthJsonError } from '../auth-validation.js';

const valid = { email: '  Maria+orders@Example.COM ', fullName: "  Maria O'Neil-Santos  ", password: ' a<>&"\'secret ' };

test('auth validation rejects bad requests before handlers and logs no submitted values', async t => {
  const logs = t.mock.method(console, 'warn', () => {});
  const app = express();
  let handled = 0;
  app.use('/api/auth', express.json({ limit: '4kb' }), handleAuthJsonError);
  for (const action of ['register', 'login', 'send-otp', 'verify-otp', 'forgot-password', 'reset-password']) {
    app.post(`/api/auth/${action}`, validateAuthInput(action), (req, res) => {
      handled++;
      res.json(req.body);
    });
  }
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/auth/`;
  const request = (action, body) => fetch(base + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const error = { error: 'Invalid request. Please check your details and try again.' };
  const invalidCases = [
    ['register', null], ['register', []], ['register', {}],
    ...['fullName', 'email', 'password'].flatMap(field => [
      ['register', { ...valid, [field]: null }],
      ['register', { ...valid, [field]: 123456 }],
      ['register', { ...valid, [field]: { value: 'not a string' } }],
      ['register', { ...valid, [field]: '' }],
    ]),
    ...['a..b@example.com', '.a@example.com', 'a.@example.com', 'a@localhost', 'a@example..com',
      'a@-example.com', 'a@exam_ple.com', 'a@example.com<script>', 'a@exa\nmple.com',
      `${'a'.repeat(65)}@example.com`, `a@${'a'.repeat(64)}.com`,
      `a@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`,
    ].map(email => ['send-otp', { email }]),
    ...['<script>alert(1)</script>', '<b>Maria</b>', 'A\u0000B', 'A\nB', 'A'.repeat(101), '   ']
      .map(fullName => ['register', { ...valid, fullName }]),
    ['register', { ...valid, password: 'short' }],
    ['register', { ...valid, password: 'a'.repeat(129) }],
    ['register', { ...valid, role: 'admin' }],
    ['login', { email: 'invalid', password: 'secret' }],
    ['login', { email: valid.email, password: '' }],
    ['login', { email: valid.email, password: 'a'.repeat(256) }],
    ...[123456, '12345', '1234567', '123456\n', 'abcdef', '１２３４５６', null]
      .map(code => ['verify-otp', { email: valid.email, code }]),
    ['forgot-password', { email: '<script>@example.com' }],
    ['reset-password', { token: 'a'.repeat(64), password: 'short' }],
    ...[null, 123, '', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'a'.repeat(63) + '\n']
      .map(token => ['reset-password', { token, password: 'New-password' }]),
  ];
  for (const [action, body] of invalidCases) {
    const response = await request(action, body);
    assert.equal(response.status, 400, `${action}: ${JSON.stringify(body)}`);
    assert.deepEqual(await response.json(), error);
  }
  for (const [body, status] of [['{"email":', 400], [JSON.stringify({ ...valid, password: 'x'.repeat(5000) }), 413]]) {
    const response = await fetch(base + 'register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), error);
  }
  assert.equal(handled, 0);
  assert.equal(logs.mock.calls.length, invalidCases.length + 2);
  for (const call of logs.mock.calls) {
    const [event, metadata] = call.arguments;
    assert.equal(event, 'auth_validation_failed');
    assert.deepEqual(Object.keys(metadata), ['action', 'reason']);
    assert.ok(['register', 'login', 'send-otp', 'verify-otp', 'forgot-password', 'reset-password', 'parse'].includes(metadata.action));
    assert.ok(['invalid_input', 'entity.parse.failed', 'entity.too.large'].includes(metadata.reason));
  }

  const response = await request('register', valid);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    email: 'maria+orders@example.com', fullName: "Maria O'Neil-Santos", password: valid.password,
  });
  for (const fullName of ['José de la Cruz', '李 小龍', 'A', 'A'.repeat(100)]) {
    assert.equal((await request('register', { ...valid, fullName })).status, 200);
  }
  for (const password of ['123456', 'a'.repeat(128)]) {
    assert.equal((await request('register', { ...valid, password })).status, 200);
  }
  for (const password of ['x', 'a'.repeat(255)]) {
    const response = await request('login', { email: valid.email, password });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).password, password);
  }
  assert.equal((await request('send-otp', { email: valid.email })).status, 200);
  assert.equal((await request('verify-otp', { email: valid.email, code: '012345' })).status, 200);
  assert.equal((await request('forgot-password', { email: valid.email })).status, 200);
  assert.equal((await request('reset-password', { token: 'a'.repeat(64), password: valid.password })).status, 200);
  assert.equal(logs.mock.calls.length, invalidCases.length + 2);
});
