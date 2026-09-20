import { createHash } from 'crypto';

export function createAuthSessionStore() {
  const sessions = new Map();

  function issueToken(userId) {
    const token = `nearpill_${createHash('sha256')
      .update(`${Date.now()}:${Math.random()}:${userId}`)
      .digest('hex')}`;
    sessions.set(token, userId);
    return token;
  }

  function issueTokens(userId) {
    return {
      accessToken: issueToken(userId),
      refreshToken: issueToken(userId),
    };
  }

  function revokeToken(token) {
    if (token) {
      sessions.delete(token);
    }
  }

  function authenticate(req, res, next) {
    const authorizationHeader = req.headers.authorization || '';
    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    const sessionUserId = req.session?.userId ?? req.authUserId;
    const userId = token ? sessions.get(token) : sessionUserId ?? null;

    if (!token && !sessionUserId) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (token && userId === undefined) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    req.authUserId = Number(userId);
    req.authToken = token || null;
    next();
  }

  return {
    issueToken,
    issueTokens,
    revokeToken,
    authenticate,
    sessions,
  };
}
