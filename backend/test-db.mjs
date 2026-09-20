import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

console.log('DB_HOST=' + process.env.DB_HOST);
console.log('DB_PORT=' + process.env.DB_PORT);
console.log('DB_USER=' + process.env.DB_USER);
console.log('DB_NAME=' + process.env.DB_NAME);

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'nearpill',
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0,
    });
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM medicines');
    console.log('DB query result:', rows);
    await pool.end();
  } catch (err) {
    console.error('DB test error:');
    console.error(err);
    process.exit(1);
  }
})();
