import { loginError } from './login-security.js';
import { hashPassword, verifyPassword } from './passwords.js';

export function createLoginHandler({ pool, authStore, security, recovery }) {
  return async (req, res) => {
    const { email, password } = req.body;
    const state = security.begin(email);
    if (!state) return res.status(401).json({ error: loginError });
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      const user = rows[0];
      if (!await verifyPassword(password, user?.password)) {
        if (security.fail(email, state) && user) {
          void recovery.notify(user, true).catch(() => console.error('lockout_notification_failed'));
        }
        return res.status(401).json({ error: loginError });
      }
      if (!user.password.startsWith('scrypt$')) {
        const encoded = await hashPassword(password);
        const [result] = await pool.query(
          'UPDATE users SET password = ? WHERE id = ? AND CAST(password AS BINARY) = CAST(? AS BINARY)',
          [encoded, user.id, user.password],
        );
        if (result.affectedRows !== 1) return res.status(401).json({ error: loginError });
      }
      // A password reset invalidates a login already checking the old credential.
      if (!security.succeed(email, state)) return res.status(401).json({ error: loginError });
      return res.json({
        ...authStore.issueTokens(Number(user.id)),
        user: { id: String(user.id), fullName: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error('login_failed', { code: error.code });
      return res.status(500).json({ error: loginError });
    } finally {
      security.release(email, state);
    }
  };
}
