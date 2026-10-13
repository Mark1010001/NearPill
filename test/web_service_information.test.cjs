const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('missing pharmacy and manufacturer data never becomes an approval or a rating', async () => {
  let data = [{ store_id: 1, name: 'Test pharmacy', rating: 0 }];
  const context = vm.createContext({ console, fetch: async () => ({ ok: true, json: async () => data }) });
  vm.runInContext(fs.readFileSync(path.join(root, 'web/js/api.js'), 'utf8'), context);
  const pharmacies = await vm.runInContext('NearPillAPI.getPharmacies()', context);
  assert.equal(pharmacies[0].licenseNo, 'Not provided');
  assert.equal(pharmacies[0].manager, 'Not provided');
  assert.equal(pharmacies[0].rating, 0);
  data = [{ id: 1, name: 'Test medicine' }];
  const catalog = await vm.runInContext('NearPillAPI.getMasterCatalog()', context);
  assert.equal(catalog[0].manufacturer, 'Not provided');
});

for (const ok of [true, false]) {
  test(`policy page ${ok ? 'renders shared text safely' : 'reports a failed load'}`, async () => {
    const elements = new Map();
    const element = () => ({ children: [], append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); } });
    const document = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
    };
    const policies = JSON.parse(fs.readFileSync(path.join(root, 'web/policies.json'), 'utf8'));
    const context = vm.createContext({ document, fetch: async () => ({ ok, json: async () => policies }) });
    vm.runInContext(fs.readFileSync(path.join(root, 'web/js/policies.js'), 'utf8'), context);
    await new Promise(setImmediate);
    if (ok) {
      assert.equal(elements.get('policySections').children.length, 4);
      assert.equal(elements.get('policyNav').children[0].href, '#privacy');
      const privacy = elements.get('policySections').children[0].children[1];
      assert.match(privacy.textContent, /nearpillemail@gmail.com/);
      assert.equal(privacy.innerHTML, undefined);
      assert.match(policies.sections[1].body, /does not process online charges or refunds/);
    } else {
      assert.match(elements.get('policyStatus').textContent, /could not be loaded/);
      assert.equal(elements.has('policySections'), false);
    }
  });
}

test('dashboard primary colors support readable white text', () => {
  const css = fs.readFileSync(path.join(root, 'web/css/styles.css'), 'utf8');
  const luminance = (hex) => {
    const channels = hex.match(/../g).map(n => parseInt(n, 16) / 255)
      .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const variable of ['primary', 'primary-dark', 'primary-hover']) {
    const [, hex] = css.match(new RegExp(`--color-${variable}: #([0-9a-f]{6})`));
    assert.ok(1.05 / (luminance(hex) + 0.05) >= 4.5, variable);
  }
});

test('password toggle announces its state and forms open as named native dialogs', () => {
  let markup = '';
  const password = { type: 'password' };
  const dialogs = new Map();
  const context = vm.createContext({
    document: {
      addEventListener() {},
      body: { insertAdjacentHTML(_, html) { markup = html; } },
      getElementById(id) {
        if (id === 'password') return password;
        if (!dialogs.has(id)) dialogs.set(id, {
          showModal() { this.open = true; },
          close() { this.open = false; },
          remove() { this.removed = true; },
        });
        return dialogs.get(id);
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'web/js/app.js'), 'utf8'), context);
  const classes = new Set(['fa-eye']);
  const toggle = {
    attributes: {},
    querySelector: () => ({ classList: { add: c => classes.add(c), remove: c => classes.delete(c) } }),
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  context.togglePasswordVisibility('password', toggle);
  assert.equal(password.type, 'text');
  assert.equal(toggle.attributes['aria-label'], 'Hide password');
  assert.equal(toggle.attributes['aria-pressed'], 'true');
  context.togglePasswordVisibility('password', toggle);
  assert.equal(password.type, 'password');
  assert.equal(toggle.attributes['aria-pressed'], 'false');
  for (const [method, id] of [['openAddPharmacyModal', 'addPharmacyModal'], ['openAddMedicineModal', 'addMedicineModal']]) {
    context[method]();
    assert.match(markup, /<dialog[^>]*aria-label=/);
    assert.match(markup, /<label[^>]*for=/);
    assert.equal(dialogs.get(id).open, true);
    context.closeModal(id);
    assert.equal(dialogs.get(id).open, false);
    assert.equal(dialogs.get(id).removed, true);
  }
});

for (const ok of [true, false]) {
  test(`reset page ${ok ? 'submits a token once and clears credentials' : 'shows a generic retry message'}`, async () => {
    let submitHandler;
    let finish;
    const calls = [];
    const token = 'a'.repeat(64);
    const elements = {
      resetForm: { reportValidity: () => true, addEventListener(_, fn) { submitHandler = fn; } },
      status: {}, submit: { disabled: false },
      password: { value: 'New-password' },
      confirmPassword: { value: 'New-password', focus() { this.focused = true; } },
    };
    const history = [];
    const context = vm.createContext({
      URLSearchParams,
      location: { hash: `#token=${token}`, pathname: '/reset-password' },
      history: { replaceState(...args) { history.push(args); } },
      document: { getElementById: id => elements[id] },
      fetch: async (...args) => {
        calls.push(args);
        await new Promise(resolve => { finish = resolve; });
        return { ok };
      },
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'backend/public/reset-password.js'), 'utf8'), context);
    assert.equal(history[0][2], '/reset-password');
    elements.confirmPassword.value = 'Does-not-match';
    await submitHandler({ preventDefault() {} });
    assert.equal(elements.confirmPassword.focused, true);
    assert.equal(calls.length, 0);
    elements.confirmPassword.value = 'New-password';
    const pending = submitHandler({ preventDefault() {} });
    await submitHandler({ preventDefault() {} });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/auth/reset-password');
    assert.deepEqual(JSON.parse(calls[0][1].body), { token, password: 'New-password' });
    finish();
    await pending;
    if (ok) {
      assert.equal(elements.resetForm.hidden, true);
      assert.equal(elements.password.value, '');
      assert.match(elements.status.textContent, /Password updated/);
    } else {
      assert.match(elements.status.textContent, /Unable to reset password/);
      assert.equal(elements.submit.disabled, false);
    }
  });
}

test('reset page hides the form when the link has no valid token', () => {
  const elements = new Map();
  const context = vm.createContext({
    URLSearchParams,
    location: { hash: '#token=invalid', pathname: '/reset-password' },
    history: { replaceState() {} },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { addEventListener() {} });
      return elements.get(id);
    } },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'backend/public/reset-password.js'), 'utf8'), context);
  assert.equal(elements.get('resetForm').hidden, true);
  assert.match(elements.get('status').textContent, /reset link is invalid/);
});
