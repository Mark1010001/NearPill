const invalidInput = 'Invalid request. Please check your details and try again.';

function validEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (email.length > 254) return false;
  const [local] = email.split('@');
  // shortcut: ASCII dot-atom emails only, expand with the mail provider when internationalized or quoted addresses are needed.
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') &&
    !local.includes('..') &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(email);
}

const schemas = {
  register: {
    email: validEmail,
    fullName: value => typeof value === 'string' && value.trim().length >= 1 &&
      value.trim().length <= 100 && /\p{L}/u.test(value) &&
      /^[\p{L}\p{M}\p{N}\p{Zs}'\u2019.,()_-]+$/u.test(value.trim()),
    // shortcut: retain the app's six-character signup minimum, strengthen both clients and server before launch.
    password: value => typeof value === 'string' && value.length >= 6 && value.length <= 128,
  },
  login: {
    email: validEmail,
    // Existing accounts may have shorter passwords; validate without changing their credentials.
    password: value => typeof value === 'string' && value.length >= 1 && value.length <= 255,
  },
  'send-otp': { email: validEmail },
  'verify-otp': {
    email: validEmail,
    code: value => typeof value === 'string' && value.length === 6 && /^[0-9]{6}$/.test(value),
  },
  'forgot-password': { email: validEmail },
  'reset-password': {
    token: value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value),
    password: value => schemas.register.password(value),
  },
};

export function validateAuthInput(action) {
  const schema = schemas[action];
  return (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => !Object.hasOwn(schema, key)) ||
        Object.entries(schema).some(([key, validate]) => !validate(body[key]))) {
      console.warn('auth_validation_failed', { action, reason: 'invalid_input' });
      return res.status(400).json({ error: invalidInput });
    }
    if (schema.email) req.body.email = body.email.trim().toLowerCase();
    if (action === 'register') req.body.fullName = body.fullName.trim();
    next();
  };
}

export function handleAuthJsonError(error, req, res, next) {
  if (error.type !== 'entity.parse.failed' && error.type !== 'entity.too.large') {
    return next(error);
  }
  console.warn('auth_validation_failed', { action: 'parse', reason: error.type });
  return res.status(error.type === 'entity.too.large' ? 413 : 400)
    .json({ error: invalidInput });
}
