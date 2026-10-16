import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nearpill',
  });

  try {
    console.log('Checking medicines table columns...');
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'medicines'",
      [process.env.DB_NAME]
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));
    if (!existing.has('category')) {
      console.log('Adding column: category');
      await pool.query("ALTER TABLE medicines ADD COLUMN category VARCHAR(128) NOT NULL DEFAULT 'General'");
    } else {
      console.log('Column category already exists');
    }
    if (!existing.has('distance')) {
      console.log('Adding column: distance');
      await pool.query("ALTER TABLE medicines ADD COLUMN distance VARCHAR(64) DEFAULT NULL");
    } else {
      console.log('Column distance already exists');
    }
    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration error:', { code: e.code });
  } finally {
    await pool.end();
  }
})();
