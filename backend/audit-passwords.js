import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { passwordFormat } from './passwords.js';

export async function auditPasswordStorage(pool) {
  const counts = { argon2id: 0, scrypt: 0, md5: 0, sha1: 0, plaintext: 0, ambiguous: 0, unsupported: 0, invalid: 0 };
  let lastId = 0;
  while (true) {
    const [rows] = await pool.query('SELECT id, password FROM users WHERE id > ? ORDER BY id LIMIT 1000', [lastId]);
    for (const row of rows) counts[passwordFormat(row.password)]++;
    if (rows.length < 1000) break;
    lastId = rows.at(-1).id;
  }
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nearpill_new',
    connectTimeout: 5000,
  });
  try {
    console.log(JSON.stringify(await auditPasswordStorage(pool), null, 2));
  } catch (error) {
    console.error('password_storage_audit_failed', { code: error.code });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
