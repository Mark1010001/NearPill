import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 };
const digest = value => createHash('sha256').update(value).digest();

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64, options);
  return `scrypt$16384$8$5$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const encoded = typeof stored === 'string' && /^scrypt\$16384\$8\$5\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  // Equal-cost derivation also runs for unknown users and legacy records.
  const key = await derive(password, encoded ? Buffer.from(encoded[1], 'hex') : Buffer.alloc(16), 64, options);
  if (encoded) return timingSafeEqual(key, Buffer.from(encoded[2], 'hex'));
  if (typeof stored !== 'string' || stored.startsWith('scrypt$')) return false;
  return timingSafeEqual(digest(password), digest(stored));
}
