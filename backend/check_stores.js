import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nearpill',
});

(async () => {
  try {
    const [stores] = await pool.query('SELECT id, drugstoreName FROM stores');
    console.log('=== STORES ===');
    for (const store of stores) {
      console.log(`\nID ${store.id}: ${store.drugstoreName}`);
      const [meds] = await pool.query(
        'SELECT name, price FROM medicines WHERE drugstoreId = ? LIMIT 5',
        [store.id]
      );
      meds.forEach(m => console.log(`  • ${m.name} - ${m.price}`));
      const [count] = await pool.query(
        'SELECT COUNT(*) as cnt FROM medicines WHERE drugstoreId = ?',
        [store.id]
      );
      console.log(`  Total: ${count[0].cnt} medicines`);
    }
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await pool.end();
  }
})();
