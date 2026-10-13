import { argon2, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveArgon2 = promisify(argon2);
const deriveScrypt = promisify(scrypt);
const argonOptions = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const scryptOptions = { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 };
const currentFormat = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;
const digest = value => createHash('sha256').update(value).digest();

export function passwordFormat(stored) {
  if (typeof stored !== 'string' || !stored) return 'invalid';
  if (currentFormat.test(stored)) return 'argon2id';
  if (/^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) return 'scrypt';
  if (/^md5\$[a-fA-F0-9]{32}$/.test(stored)) return 'md5';
  if (/^sha1\$[a-fA-F0-9]{40}$/.test(stored)) return 'sha1';
  // A bare digest is indistinguishable from a hex-only password; require recovery rather than accepting a hash as a password.
  if (/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(stored)) return 'ambiguous';
  if (/^(?:\$(?:argon2|2[aby]\$)|scrypt\$|md5\$|sha1\$)/.test(stored)) return 'unsupported';
  return 'plaintext';
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveArgon2('argon2id', { ...argonOptions, message: password, nonce: salt });
  return `$argon2id$v=19$m=19456,t=2,p=1$${salt.toString('base64').replace(/=/g, '')}$${key.toString('base64').replace(/=/g, '')}`;
}

export async function verifyPassword(password, stored) {
  const format = passwordFormat(stored);
  const current = format === 'argon2id' && currentFormat.exec(stored);
  const legacy = format === 'scrypt' && stored.split('$');
  // shortcut: run both KDFs uniformly during migration, remove the scrypt work after all legacy records are retired.
  const [key, oldKey] = await Promise.all([
    deriveArgon2('argon2id', { ...argonOptions, message: password, nonce: current ? Buffer.from(current[1], 'base64') : Buffer.alloc(16) }),
    deriveScrypt(password, legacy ? Buffer.from(legacy[4], 'hex') : Buffer.alloc(16), 64, scryptOptions),
  ]);
  if (current) return timingSafeEqual(key, Buffer.from(current[2], 'base64'));
  if (legacy) return timingSafeEqual(oldKey, Buffer.from(legacy[5], 'hex'));
  if (format === 'md5' || format === 'sha1') {
    const submitted = createHash(format).update(password).digest();
    return timingSafeEqual(submitted, Buffer.from(stored.split('$')[1], 'hex'));
  }
  return format === 'plaintext' && timingSafeEqual(digest(password), digest(stored));
}
