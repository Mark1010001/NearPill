import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './passwords.js';

const duration = 15 * 60_000;
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const resetError = 'Unable to reset password. Request a new link or try again later.';

export function createPasswordRecovery({ pool, authStore, security, sendEmail, publicUrl, now = Date.now }) {
  const page = new URL('/reset-password', publicUrl);
  if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password ||
      (process.env.NODE_ENV === 'production' && page.protocol !== 'https:')) {
    throw new Error('PUBLIC_APP_URL must be an HTTPS URL in production.');
  }
  // shortcut: reset state is local and lost on restart, move it to shared storage before using multiple server instances.
  const tokens = new Map();
  const users = new Map();
  function remove(key) {
    const record = tokens.get(key);
    if (record) users.delete(record.userId);
    tokens.delete(key);
  }
  const cleanup = setInterval(() => {
    for (const [key, record] of tokens) {
      if (!record.busy && record.expiresAt <= now()) remove(key);
    }
  }, 60_000);
  cleanup.unref();

  async function notify(user, locked = false) {
    const previous = users.get(user.id);
    const existing = tokens.get(previous);
    if (existing?.busy || (existing?.expiresAt > now() && !locked)) return;
    if (previous) remove(previous);
    if (tokens.size >= 10_000) {
      console.error('password_recovery_capacity_reached');
      return;
    }
    const token = randomBytes(32).toString('hex');
    const key = tokenHash(token);
    tokens.set(key, { userId: user.id, email: user.email.trim().toLowerCase(), expiresAt: now() + duration, busy: false });
    users.set(user.id, key);
    const link = new URL(page);
    link.hash = `token=${token}`;
    const intro = locked
      ? 'Repeated unsuccessful sign-in attempts temporarily blocked your NearPill account for 15 minutes.'
      : 'A password reset was requested for your NearPill account.';
    await sendEmail(user.email, 'NearPill account security',
      `${intro}\n\nReset your password using this single-use link, which expires in 15 minutes:\n${link.href}\n\nIf you did not request this, you can ignore this email. Contact nearpillemail@gmail.com if you need help.`);
  }

  async function requestReset(req, res) {
    try {
      const [rows] = await pool.query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [req.body.email]);
      if (rows[0]) void notify(rows[0]).catch(() => console.error('password_recovery_notification_failed'));
    } catch (error) {
      console.error('password_recovery_request_failed', { code: error.code });
    }
    return res.json({ message: 'If this account can receive email, a reset link will be sent.' });
  }

  async function resetPassword(req, res) {
    const key = tokenHash(req.body.token);
    const record = tokens.get(key);
    if (!record || record.busy || record.expiresAt <= now()) {
      return res.status(400).json({ error: resetError });
    }
    record.busy = true;
    try {
      const encoded = await hashPassword(req.body.password);
      if (record.expiresAt <= now()) return res.status(400).json({ error: resetError });
      const [result] = await pool.query('UPDATE users SET password = ? WHERE id = ?', [encoded, record.userId]);
      if (result.affectedRows !== 1) {
        remove(key);
        return res.status(400).json({ error: resetError });
      }
      authStore.revokeUserTokens(Number(record.userId));
      security.reset(record.email);
      remove(key);
      return res.json({ message: 'Password updated. You can now sign in with your new password.' });
    } catch (error) {
      console.error('password_reset_failed', { code: error.code });
      return res.status(500).json({ error: resetError });
    } finally {
      record.busy = false;
    }
  }

  return { notify, requestReset, resetPassword, close() { clearInterval(cleanup); } };
}
