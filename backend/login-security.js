export const loginError = 'Unable to sign in. Check your details or try again later.';
const minute = 60_000;
const lockDuration = 15 * minute;

export function createLoginSecurity({ now = Date.now } = {}) {
  // shortcut: state is local, capped at 10,000 entries per map and lost on restart; use shared storage before scaling to multiple servers.
  const ips = new Map();
  const accounts = new Map();
  const cleanup = setInterval(() => {
    for (const [key, times] of ips) {
      if (times.at(-1) <= now() - minute) ips.delete(key);
    }
    for (const [key, state] of accounts) {
      if (!state.inFlight && state.expiresAt <= now()) accounts.delete(key);
    }
  }, minute);
  cleanup.unref();

  function limitIp(req, res, next) {
    const times = (ips.get(req.ip) || []).filter(time => time > now() - minute);
    if (times.length >= 10 || (!ips.has(req.ip) && ips.size >= 10_000)) {
      return res.status(401).json({ error: loginError });
    }
    times.push(now());
    ips.set(req.ip, times);
    next();
  }

  function begin(email) {
    let state = accounts.get(email);
    if (state && !state.inFlight && state.expiresAt <= now()) {
      accounts.delete(email);
      state = null;
    }
    if (state?.inFlight || state?.nextAllowedAt > now()) return null;
    if (!state && accounts.size >= 10_000) return null;
    state ||= { failures: 0, nextAllowedAt: 0, expiresAt: now() + lockDuration };
    state.inFlight = true;
    accounts.set(email, state);
    return state;
  }

  function fail(email, state) {
    if (accounts.get(email) !== state) return false;
    state.failures++;
    state.nextAllowedAt = now() + (state.failures >= 5 ? lockDuration : 1000 * 2 ** (state.failures - 1));
    state.expiresAt = now() + lockDuration;
    return state.failures === 5;
  }

  function succeed(email, state) {
    if (accounts.get(email) !== state) return false;
    accounts.delete(email);
    return true;
  }

  return {
    limitIp, begin, fail, succeed,
    release(email, state) {
      state.inFlight = false;
      if (!state.failures && accounts.get(email) === state) accounts.delete(email);
    },
    reset(email) { accounts.delete(email); },
    close() { clearInterval(cleanup); },
  };
}
