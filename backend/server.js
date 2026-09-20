import express from 'express';
import cors from 'cors';
import { createHash, randomInt } from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createAuthSessionStore } from './auth.js';

dotenv.config();



const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or file://) or any local dev origin
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }

    callback(new Error('CORS policy does not allow this origin.'));
  },
  credentials: true,
}));
app.use(express.json());

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'nearpill',
  PORT = '3000',
} = process.env;

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const authStore = createAuthSessionStore();
const pendingOtps = new Map();
const verifiedEmails = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashOtp(email, code) {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

async function sendVerificationEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    console.warn(`[OTP DEV ONLY] ${email}: ${code}`);
    return { devMode: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your NearPill verification code',
        html: `<p>Your NearPill verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.message || response.statusText;
      console.warn(`[OTP RESEND RESTRICTION] ${response.status}: ${errorMsg}`);
      console.info(`[OTP DEV CODE] Verification code for ${email} is: ${code}`);

      if (response.status === 403 || response.status === 422 || process.env.NODE_ENV !== 'production') {
        return { devMode: true, message: errorMsg };
      }
      throw new Error(`Email provider returned ${response.status}: ${errorMsg}`);
    }

    return { devMode: false };
  } catch (error) {
    console.warn(`[OTP EMAIL ERROR] ${error.message}`);
    console.info(`[OTP DEV CODE] Verification code for ${email} is: ${code}`);
    if (process.env.NODE_ENV !== 'production') {
      return { devMode: true, message: error.message };
    }
    throw error;
  }
}

async function ensureOrdersTable() {
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'orders'");
    if (Array.isArray(tables) && tables.length > 0) {
      try {
        await pool.query("ALTER TABLE orders ADD COLUMN userId INT DEFAULT NULL");
        // Update old orders to belong to Juan Dela Cruz (user ID 1) so they aren't lost
        await pool.query("UPDATE orders SET userId = 1 WHERE userId IS NULL");
      } catch (e) {
        // Column likely already exists, ignore
      }
      return;
    }

    await pool.query(`
      CREATE TABLE orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT DEFAULT NULL,
        reference VARCHAR(64) NOT NULL UNIQUE,
        storeName VARCHAR(255) NOT NULL,
        itemSummary VARCHAR(1024) NOT NULL,
        itemCount INT NOT NULL,
        total VARCHAR(64) NOT NULL,
        placedOn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        stage VARCHAR(32) NOT NULL DEFAULT 'placed',
        items TEXT
      )
    `);
  } catch (error) {
    if (error?.code === 'ER_TABLEACCESS_DENIED_ERROR') {
      console.warn(
        'Unable to auto-create the orders table because the DB user lacks CREATE permission. If the table already exists, this warning can be ignored.',
        error.message,
      );
      return;
    }
    throw error;
  }
}

async function ensureUsersTable() {
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(tables) || tables.length === 0) {
      await pool.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          fullName VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          phone VARCHAR(32),
          birthdate VARCHAR(32),
          password VARCHAR(255) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert default user
      await pool.query(`
        INSERT INTO users (fullName, email, phone, birthdate, password) 
        VALUES ('Juan Dela Cruz', 'juan.delacruz@example.com', '+63 917 890 1234', 'October 14, 1994', 'password123')
      `);
    }

    // Ensure Admin user admin@nearpill.ph exists
    const [adminCheck] = await pool.query("SELECT id FROM users WHERE email = 'admin@nearpill.ph'");
    if (!Array.isArray(adminCheck) || adminCheck.length === 0) {
      await pool.query(`
        INSERT INTO users (fullName, email, phone, password)
        VALUES ('Central Operations Admin', 'admin@nearpill.ph', '+63 917 000 0000', 'admin123')
      `);
    }
  } catch (error) {
    if (error?.code === 'ER_TABLEACCESS_DENIED_ERROR') {
      console.warn(
        'Unable to auto-create the users table because the DB user lacks CREATE permission.',
        error.message,
      );
      return;
    }
    throw error;
  }
}

app.get('/', (_req, res) => {
  res.json({ message: 'NearPill backend is running' });
});

app.post('/api/auth/register', async (req, res) => {
  const { fullName, password } = req.body;
  const email = normaliseEmail(req.body.email);
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const verifiedUntil = verifiedEmails.get(email);
  if (!verifiedUntil || verifiedUntil < Date.now()) {
    verifiedEmails.delete(email);
    return res.status(403).json({ error: 'Please verify your email first.' });
  }
  verifiedEmails.delete(email);
  try {
    const [result] = await pool.query(
      'INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)',
      [fullName, email, password]
    );
    const userId = Number(result.insertId);
    const { accessToken, refreshToken } = authStore.issueTokens(userId);
    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: userId.toString(),
        fullName,
        email,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already exists.' });
    } else {
      console.error('Registration failed:', error);
      res.status(500).json({ error: 'Registration failed.' });
    }
  }
});

app.post('/api/auth/send-otp', async (req, res) => {
  const email = normaliseEmail(req.body.email);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  const code = randomInt(100000, 1000000).toString();
  pendingOtps.set(email, {
    codeHash: hashOtp(email, code),
    expiresAt: Date.now() + OTP_TTL_MS,
  });

  try {
    const result = await sendVerificationEmail(email, code);
    if (result?.devMode) {
      res.json({
        message: 'Verification code sent.',
        devCode: code,
        devNote: 'Resend sandbox limit active. Code logged to server console.'
      });
    } else {
      res.json({ message: 'Verification code sent.' });
    }
  } catch (error) {
    pendingOtps.delete(email);
    console.error('Unable to send verification email:', error.message);
    res.status(502).json({ error: 'Unable to send verification email.' });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const email = normaliseEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const pending = pendingOtps.get(email);

  if (!pending || pending.expiresAt < Date.now() || hashOtp(email, code) !== pending.codeHash) {
    if (pending?.expiresAt < Date.now()) pendingOtps.delete(email);
    return res.status(400).json({ error: 'The code is invalid or expired.' });
  }

  pendingOtps.delete(email);
  verifiedEmails.set(email, Date.now() + OTP_TTL_MS);
  res.json({ message: 'Email verified.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0 || rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const userId = Number(rows[0].id);
    const { accessToken, refreshToken } = authStore.issueTokens(userId);
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: userId.toString(),
        fullName: rows[0].fullName,
        email: rows[0].email,
      }
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', authStore.authenticate, (req, res) => {
  authStore.revokeToken(req.authToken);
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authStore.authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, fullName, email, phone, birthdate FROM users WHERE id = ?',
      [req.authUserId]
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const user = rows[0];
      res.json({
        id: user.id.toString(),
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        birthDate: user.birthdate,
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Failed to fetch user:', error);
    res.status(500).json({ error: 'Unable to load profile.' });
  }
});

app.put('/api/auth/me', authStore.authenticate, async (req, res) => {
  const { phone, birthDate } = req.body;
  try {
    await pool.query(
      'UPDATE users SET phone = ?, birthdate = ? WHERE id = ?',
      [phone || null, birthDate || null, req.authUserId]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Failed to update user profile:', error);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

app.get('/api/medicines', async (req, res) => {
  const rawSearch = (req.query.search ?? '').toString().trim();
  const hasSearch = rawSearch.length > 0;

  const selectClause = `
    SELECT
      d.drug_id AS id,
      d.brand_name AS name,
      i.price AS price,
      s.store_name AS drugstoreName,
      s.store_id AS drugstoreId,
      d.dosage_form AS category,
      i.stock_count AS stockCount,
      d.rx_required AS rxRequired,
      d.description AS description,
      i.created_at AS createdAt,
      NULL AS distance
    FROM inventory i
    JOIN drugs d ON d.drug_id = i.drug_id
    JOIN stores s ON s.store_id = i.store_id
  `;

  const sql = hasSearch
    ? `${selectClause} WHERE LOWER(d.brand_name) LIKE LOWER(?) OR LOWER(s.store_name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)`
    : selectClause;
  const params = hasSearch ? [`%${rawSearch}%`, `%${rawSearch}%`, `%${rawSearch}%`] : [];

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch medicines:', error);
    res.status(500).json({ error: 'Unable to load medicines.' });
  }
});

app.get('/api/stores/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT
        store_id AS id,
        store_name AS drugstoreName,
        address_text AS branch,
        '' AS facebook,
        '' AS phone,
        address_text AS location,
        '' AS hours,
        is_active AS openNow
      FROM stores
      WHERE store_id = ?`,
      [id]
    );

    if (Array.isArray(rows) && rows.length > 0) {
      const store = rows[0];
      res.json({
        ...store,
        openNow: store.openNow === 1,
      });
    } else {
      res.status(404).json({ error: 'Store not found.' });
    }
  } catch (error) {
    console.error('Failed to fetch store:', error);
    res.status(500).json({ error: 'Unable to load store details.' });
  }
});

app.get('/api/stores/:id/inventory', async (req, res) => {
  const { id } = req.params;
  const rawSearch = (req.query.search ?? '').toString().trim();
  const category = (req.query.category ?? '').toString().trim();
  const hasSearch = rawSearch.length > 0;
  const hasCategory = category.length > 0 && category.toLowerCase() !== 'all';

  let sql = `
    SELECT
      d.drug_id AS id,
      d.brand_name AS name,
      i.price AS price,
      s.store_name AS drugstoreName,
      s.store_id AS drugstoreId,
      d.dosage_form AS category,
      i.stock_count AS stockCount,
      d.rx_required AS rxRequired,
      d.description AS description,
      i.created_at AS createdAt,
      NULL AS distance
    FROM inventory i
    JOIN drugs d ON d.drug_id = i.drug_id
    JOIN stores s ON s.store_id = i.store_id
    WHERE s.store_id = ?
  `;
  const params = [id];

  if (hasSearch) {
    sql += ' AND (LOWER(d.brand_name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?))';
    params.push(`%${rawSearch}%`, `%${rawSearch}%`);
  }

  if (hasCategory) {
    sql += ' AND LOWER(d.dosage_form) = LOWER(?)';
    params.push(category);
  }

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch store inventory:', error);
    res.status(500).json({ error: 'Unable to load store inventory.' });
  }
});

app.post('/api/orders', authStore.authenticate, async (req, res) => {
  const { items, pickupDate, pickupTime, paymentPlan, total } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order items are required.' });
  }

  const itemSummary = items
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(', ');
  const itemCount = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const reference = `NP-${Date.now().toString().slice(-8)}`;
  const storeName = items[0]?.drugstoreName || 'Pharmacy Health Plus';
  const stage = 'placed';
  const userIdToSave = req.authUserId;

  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'INSERT INTO orders (reference, storeName, itemSummary, itemCount, total, stage, items, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          reference,
          storeName,
          itemSummary,
          itemCount,
          total,
          stage,
          JSON.stringify(items),
          userIdToSave,
        ],
      );

      for (const item of items) {
        const quantity = Number(item.quantity || 0);
        const drugId = Number(item.id);
        const storeId = Number(item.drugstoreId);

        if (!quantity || !drugId || !storeId) {
          throw new Error('Invalid order item data.');
        }

        const [result] = await conn.query(
          'UPDATE inventory SET stock_count = stock_count - ? WHERE drug_id = ? AND store_id = ? AND stock_count >= ?',
          [quantity, drugId, storeId, quantity],
        );

        if (result.affectedRows === 0) {
          throw new Error(`Not enough stock for item ${item.name || drugId}`);
        }
      }

      await conn.commit();
    } catch (dbError) {
      await conn.rollback();
      throw dbError;
    } finally {
      conn.release();
    }

    res.status(201).json({
      reference,
      storeName,
      itemSummary,
      itemCount,
      total,
      stage,
      items,
      placedOn: 'Just now',
    });
  } catch (error) {
    console.error('Failed to create order:', error);
    const errorMessage = error?.message?.toString?.() || 'Unable to place order.';
    const isClientError =
      errorMessage.startsWith('Not enough stock for item') ||
      errorMessage === 'Invalid order item data.';

    res.status(isClientError ? 400 : 500).json({ error: errorMessage });
  }
});

app.get('/api/orders', authStore.authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT reference, storeName, itemSummary, itemCount, total, DATE_FORMAT(placedOn, "%b %d, %Y %h:%i %p") AS placedOn, stage, items FROM orders WHERE userId = ? ORDER BY id DESC',
      [req.authUserId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    res.status(500).json({ error: 'Unable to load orders.' });
  }
});

// -------------------------------------------------------------------
// ADMIN PORTAL API ENDPOINTS (Shared Backend DAL)
// -------------------------------------------------------------------

app.get('/api/admin/metrics', async (_req, res) => {
  try {
    const [orderRows] = await pool.query('SELECT total, stage FROM orders');
    const [storeRows] = await pool.query('SELECT store_id, is_active FROM stores');

    let totalGMV = 0;
    for (const o of orderRows) {
      const val = parseFloat(String(o.total || '0').replace(/[^0-9.]/g, ''));
      if (!isNaN(val)) totalGMV += val;
    }

    const activePharmaciesCount = storeRows.filter(s => s.is_active === 1 || s.is_active === true).length;
    const totalOrdersCount = orderRows.length;
    const rxPendingVerificationCount = orderRows.filter(o => o.stage === 'Rx Verification Required' || o.stage === 'verification').length;

    res.json({
      totalGMV: Math.round(totalGMV * 100) / 100,
      activePharmaciesCount,
      pendingPharmacyOnboarding: 0,
      totalOrdersCount,
      rxPendingVerificationCount
    });
  } catch (error) {
    console.error('Failed to fetch admin metrics:', error);
    res.status(500).json({ error: 'Unable to fetch metrics.' });
  }
});

const storeDetailsMap = new Map();

function formatTimeAmPm(timeStr) {
  if (!timeStr || timeStr === '23:59' || timeStr === '24:00') return '24 Hours';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const m = mStr ? mStr.padStart(2, '0') : '00';
  return `${h}:${m} ${ampm}`;
}

function checkStoreOpenStatus(openTime = "08:00", closeTime = "16:00") {
  if (openTime === closeTime || (openTime === '00:00' && (closeTime === '23:59' || closeTime === '24:00'))) {
    return true; // 24 Hours operation
  }
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [openH, openM] = (openTime || "08:00").split(':').map(Number);
  const [closeH, closeM] = (closeTime || "16:00").split(':').map(Number);

  const openMin = (openH || 8) * 60 + (openM || 0);
  const closeMin = (closeH || 16) * 60 + (closeM || 0);

  if (closeMin < openMin) {
    return currentMinutes >= openMin || currentMinutes <= closeMin;
  }
  return currentMinutes >= openMin && currentMinutes <= closeMin;
}

function getStoreCustomDetails(storeId, rawStoreName) {
  const key = String(storeId);
  const custom = storeDetailsMap.get(key) || storeDetailsMap.get(`PH-00${storeId}`) || {};

  let openTime = custom.openingTime || '08:00';
  let closeTime = custom.closingTime || (storeId == 2 ? '22:00' : '16:00');

  const is24Hours = openTime === closeTime || (openTime === '00:00' && (closeTime === '23:59' || closeTime === '24:00'));

  if (is24Hours) {
    openTime = '00:00';
    closeTime = '23:59';
  }

  const isOpen = is24Hours ? true : checkStoreOpenStatus(openTime, closeTime);
  const hoursDisplay = is24Hours ? '24 Hours (Open Always)' : `${formatTimeAmPm(openTime)} - ${formatTimeAmPm(closeTime)}`;

  return {
    licenseNo: custom.licenseNo || 'FDA-PH-2024-001',
    contact: custom.contact || '+63 917 000 0000',
    manager: custom.manager || 'Pharm. Branch Staff',
    openingTime: openTime,
    closingTime: closeTime,
    hoursDisplay: hoursDisplay,
    openNow: isOpen ? 1 : 0,
    computedStatus: isOpen ? 'Open' : 'Closed'
  };
}

app.get('/api/admin/pharmacies', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        CONCAT('PH-00', store_id) AS id,
        store_id,
        LOWER(REPLACE(store_name, ' ', '-')) AS slug,
        store_name AS name,
        address_text AS address,
        CONCAT(LOWER(REPLACE(store_name, ' ', '-')), '@nearpill.ph') AS email,
        CASE WHEN is_active = 1 THEN 'Active' ELSE 'Pending Verification' END AS status,
        4.8 AS rating,
        0 AS totalOrders,
        0 AS totalSales,
        DATE_FORMAT(NOW(), '%Y-%m-%d') AS joinedDate
      FROM stores
    `);

    const result = rows.map(r => {
      const custom = getStoreCustomDetails(r.store_id, r.name);
      return {
        ...r,
        licenseNo: custom.licenseNo,
        contact: custom.contact,
        manager: custom.manager,
        openingTime: custom.openingTime,
        closingTime: custom.closingTime,
        hoursDisplay: custom.hoursDisplay,
        openNow: custom.openNow,
        computedStatus: custom.computedStatus
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch pharmacies:', error);
    res.status(500).json({ error: 'Unable to fetch pharmacies.' });
  }
});

app.get('/api/admin/orders', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.reference,
        o.storeName,
        o.itemSummary,
        o.itemCount,
        o.total,
        DATE_FORMAT(o.placedOn, "%b %d, %Y %h:%i %p") AS placedOn,
        o.stage,
        o.items,
        u.fullName AS customerName,
        u.email AS customerEmail
      FROM orders o
      LEFT JOIN users u ON u.id = o.userId
      ORDER BY o.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch all orders for admin:', error);
    res.status(500).json({ error: 'Unable to load orders.' });
  }
});

app.get('/api/stores', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        store_id AS id,
        store_name AS name,
        address_text AS location,
        4.8 AS rating,
        '0.8 km' AS distance,
        is_active AS openNow
      FROM stores
      WHERE is_active = 1
    `);

    const result = rows.map(r => {
      const custom = getStoreCustomDetails(r.id, r.name);
      return {
        ...r,
        openNow: custom.openNow,
        isOpen: custom.openNow === 1,
        openingTime: custom.openingTime,
        closingTime: custom.closingTime,
        hoursDisplay: custom.hoursDisplay
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch stores:', error);
    res.status(500).json({ error: 'Unable to load stores.' });
  }
});

app.post('/api/admin/pharmacies', async (req, res) => {
  const { name, address, licenseNo, manager, contact, latitude, longitude, openingTime, closingTime } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'Drugstore name and address are required.' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const email = `${slug}@nearpill.ph`;
  const lat = latitude ? parseFloat(latitude) : (10.3157 + (Math.random() * 0.02 - 0.01));
  const lng = longitude ? parseFloat(longitude) : (123.8854 + (Math.random() * 0.02 - 0.01));
  const openT = openingTime || '08:00';
  const closeT = closingTime || '16:00';

  try {
    const [result] = await pool.query(
      'INSERT INTO stores (store_name, address_text, latitude, longitude, is_active) VALUES (?, ?, ?, ?, 1)',
      [name, address, lat, lng]
    );

    const storeId = result.insertId;
    storeDetailsMap.set(String(storeId), {
      licenseNo: licenseNo || 'FDA-PH-2024-8899',
      manager: manager || 'Branch Manager',
      contact: contact || '+63 917 000 0000',
      openingTime: openT,
      closingTime: closeT
    });
    storeDetailsMap.set(`PH-00${storeId}`, {
      licenseNo: licenseNo || 'FDA-PH-2024-8899',
      manager: manager || 'Branch Manager',
      contact: contact || '+63 917 000 0000',
      openingTime: openT,
      closingTime: closeT
    });

    const custom = getStoreCustomDetails(storeId, name);

    res.status(201).json({
      id: `PH-00${storeId}`,
      store_id: storeId,
      slug,
      name,
      licenseNo: custom.licenseNo,
      address,
      contact: custom.contact,
      manager: custom.manager,
      email,
      openingTime: custom.openingTime,
      closingTime: custom.closingTime,
      hoursDisplay: custom.hoursDisplay,
      openNow: custom.openNow,
      computedStatus: custom.computedStatus,
      status: 'Active',
      rating: 4.8,
      totalOrders: 0,
      totalSales: 0,
      joinedDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to register pharmacy:', error);
    res.status(500).json({ error: 'Unable to add partner pharmacy.' });
  }
});

app.put('/api/admin/pharmacies/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = parseInt(id.replace(/[^0-9]/g, '')) || id;
  const { name, address, licenseNo, manager, contact, status, openingTime, closingTime } = req.body;

  try {
    const isActive = status === 'Active' || status === 'Open' || status === 1 || status === undefined ? 1 : 0;
    await pool.query(
      'UPDATE stores SET store_name = ?, address_text = ?, is_active = ? WHERE store_id = ?',
      [name, address, isActive, numericId]
    );

    const openT = openingTime || '08:00';
    const closeT = closingTime || '16:00';

    storeDetailsMap.set(String(numericId), {
      licenseNo: licenseNo || 'FDA-PH-2024-001',
      manager: manager || 'Branch Manager',
      contact: contact || '+63 917 000 0000',
      openingTime: openT,
      closingTime: closeT
    });
    storeDetailsMap.set(String(id), {
      licenseNo: licenseNo || 'FDA-PH-2024-001',
      manager: manager || 'Branch Manager',
      contact: contact || '+63 917 000 0000',
      openingTime: openT,
      closingTime: closeT
    });

    const custom = getStoreCustomDetails(numericId, name);

    res.json({
      id: id,
      store_id: numericId,
      name,
      address,
      licenseNo: custom.licenseNo,
      manager: custom.manager,
      contact: custom.contact,
      status: isActive ? 'Active' : 'Inactive',
      openingTime: custom.openingTime,
      closingTime: custom.closingTime,
      openNow: custom.openNow,
      computedStatus: custom.computedStatus,
      hoursDisplay: custom.hoursDisplay
    });
  } catch (error) {
    console.error('Failed to update pharmacy:', error);
    res.status(500).json({ error: 'Unable to update pharmacy.' });
  }
});

app.delete('/api/admin/pharmacies/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = parseInt(id.replace(/[^0-9]/g, '')) || id;

  try {
    await pool.query('DELETE FROM stores WHERE store_id = ?', [numericId]);
    storeDetailsMap.delete(String(numericId));
    storeDetailsMap.delete(String(id));
    res.json({ success: true, message: `Pharmacy ${id} removed successfully.` });
  } catch (error) {
    console.error('Failed to delete pharmacy:', error);
    res.status(500).json({ error: 'Unable to delete pharmacy.' });
  }
});

async function startServer() {
  try {
    await ensureOrdersTable();
    await ensureUsersTable();
  } catch (error) {
    if (error?.code === 'ER_TABLEACCESS_DENIED_ERROR' || error?.code === 'ER_DBACCESS_DENIED_ERROR') {
      console.warn(
        'Unable to auto-create the orders table because the DB user lacks CREATE permission. Start the server anyway, but orders will fail until the table exists.',
        error.message,
      );
    } else {
      console.error('Failed to start backend:', error);
      process.exit(1);
    }
  }

  app.listen(Number(PORT), () => {
    console.log(`NearPill backend listening on http://localhost:${PORT}`);
  });
}

startServer();
