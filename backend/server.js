import express from 'express';
import cors from 'cors';
import { createHash, randomInt } from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createAuthSessionStore } from './auth.js';
import { validateAuthInput, requireVerifiedEmail, handleAuthJsonError } from './auth-validation.js';
import { fileURLToPath } from 'node:url';
import { createLoginSecurity } from './login-security.js';
import { createLoginHandler } from './login-handler.js';
import { createPasswordRecovery } from './password-recovery.js';
import { hashPassword } from './passwords.js';
import { sendEmail, verificationRecipient } from './email.js';

dotenv.config();

const app = express();
const loginSecurity = createLoginSecurity();
const recoverySecurity = createLoginSecurity();

/* =========================================================
   APP CONFIGURATION
========================================================= */

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        process.env.NODE_ENV !== 'production'
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS policy does not allow this origin.'));
    },
    credentials: true,
  })
);

app.use('/api/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// Count every login POST, including requests rejected by JSON parsing or validation.
app.post('/api/auth/login', loginSecurity.limitIp);
app.post(['/api/auth/forgot-password', '/api/auth/reset-password'], recoverySecurity.limitIp);
app.use('/api/auth', express.json({ limit: '4kb' }), handleAuthJsonError);
app.use(express.json());

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'nearpill_new',
  PORT = '3001',
} = process.env;

/* =========================================================
   MYSQL CONNECTION POOL
========================================================= */

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

/* =========================================================
   AUTH / OTP STORAGE
========================================================= */

const authStore = createAuthSessionStore();
const recovery = createPasswordRecovery({
  pool, authStore, security: loginSecurity, sendEmail,
  publicUrl: process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`,
});

app.get('/reset-password', (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.sendFile(fileURLToPath(new URL('./public/reset-password.html', import.meta.url)));
});
app.use('/recovery', express.static(fileURLToPath(new URL('./public/', import.meta.url))));

const pendingOtps = new Map();
const verifiedEmails = new Map();

const OTP_TTL_MS = 10 * 60 * 1000;

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function hashOtp(email, code) {
  return createHash('sha256')
    .update(`${email}:${code}`)
    .digest('hex');
}

function generateOrderReference() {
  return `NP-${Date.now()}-${randomInt(1000, 9999)}`;
}

function formatDate(date) {
  if (!date) {
    return null;
  }

  try {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date;
  }
}

function getBearerToken(req) {
  const authorizationHeader = req.headers.authorization || '';

  const match = authorizationHeader.match(
    /^Bearer\s+(.+)$/i
  );

  return match?.[1]?.trim() || null;
}

/* =========================================================
   EMAIL / OTP
========================================================= */

async function sendVerificationEmail(email, code) {
  // shortcut: local testing redirects codes to one inbox; remove DEV_OTP_INBOX when verifying real account ownership.
  const recipient = verificationRecipient(email);
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    if (process.env.NODE_ENV === 'production') return { sent: false };
    return { devMode: true, devCode: code };
  }
  const sent = await sendEmail(recipient, 'Your NearPill verification code',
    `Your NearPill verification code is ${code}. It expires in 10 minutes.`);
  return { devMode: false, sent, testInbox: recipient !== email };
}

/* =========================================================
   DATABASE VERIFICATION
========================================================= */

async function verifyDatabase() {
  const connection = await pool.getConnection();

  try {
    await connection.query('SELECT 1');

    const [tables] = await connection.query(
      `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
      `,
      [DB_NAME]
    );

    const tableNames = tables.map(
      (row) => row.TABLE_NAME
    );

    const requiredTables = [
      'users',
      'drugstores',
      'medicines',
      'inventory',
      'orders',
      'order_drugstores',
      'order_items',
      'payments',
      'subscriptions',
      'audit_logs',
    ];

    const missingTables = requiredTables.filter(
      (table) => !tableNames.includes(table)
    );

    if (missingTables.length > 0) {
      throw new Error(
        `Missing required database tables: ${missingTables.join(', ')}`
      );
    }

    console.log(
      `Connected to MySQL database: ${DB_NAME}`
    );

    console.log(
      `Verified tables: ${requiredTables.join(', ')}`
    );
  } finally {
    connection.release();
  }
}

/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

function authenticate(req, res, next) {
  return authStore.authenticate(
    req,
    res,
    next
  );
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get('/', (req, res) => {
  res.json({
    message: 'NearPill backend is running',
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      database: DB_NAME,
    });
  } catch (error) {
    console.error(
      'Health check failed:',
      { code: error.code }
    );

    res.status(500).json({
      status: 'error',
      error: 'Database connection failed.',
    });
  }
});

/* =========================================================
   AUTH — REGISTER
========================================================= */

app.post('/api/auth/register', validateAuthInput('register'), requireVerifiedEmail(verifiedEmails), async (req, res) => {
  const { fullName: cleanName, email: cleanEmail, password: cleanPassword } = req.body;

  try {
    const [existingUsers] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error:
          'An account with this email already exists.',
      });
    }

    const passwordHash = await hashPassword(cleanPassword);
    const [result] = await pool.query(
      `
      INSERT INTO users
        (name, email, password, role)
      VALUES
        (?, ?, ?, 'customer')
      `,
      [
        cleanName,
        cleanEmail,
        passwordHash,
      ]
    );

    const userId = Number(
      result.insertId
    );

    verifiedEmails.delete(cleanEmail);

    const {
      accessToken,
      refreshToken,
    } = authStore.issueTokens(userId);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: userId.toString(),
        fullName: cleanName,
        email: cleanEmail,
      },
    });
  } catch (error) {
    console.error(
      'Registration failed:',
      { code: error.code }
    );

    res.status(500).json({
      error: 'Registration failed.',
    });
  }
});

/* =========================================================
   AUTH — SEND OTP
========================================================= */

app.post('/api/auth/send-otp', validateAuthInput('send-otp'), async (req, res) => {
  const { email } = req.body;

  try {
    const [users] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (users.length > 0) {
      return res.status(409).json({
        error:
          'An account with this email already exists.',
      });
    }

    const code = String(
      randomInt(100000, 1000000)
    );

    const otpHash = hashOtp(
      email,
      code
    );

    pendingOtps.set(email, {
      hash: otpHash,
      expiresAt:
        Date.now() + OTP_TTL_MS,
    });
    verifiedEmails.delete(email);

    const emailResult =
      await sendVerificationEmail(
        email,
        code
      );

    if (!emailResult.devMode && !emailResult.sent) {
      pendingOtps.delete(email);
      return res.status(503).json({ error: 'Verification email could not be sent. Please try again later.' });
    }

    res.json({
      message:
        'Verification code sent.',
      email,
      devMode:
        emailResult.devMode === true,
      testInbox: emailResult.testInbox === true,
      ...(emailResult.devMode ? { devCode: emailResult.devCode } : {}),
    });
  } catch (error) {
    console.error(
      'Send OTP failed:',
      { code: error.code }
    );

    res.status(500).json({
      error:
        'Unable to send verification code.',
    });
  }
});

/* =========================================================
   AUTH — VERIFY OTP
========================================================= */

app.post(
  '/api/auth/verify-otp',
  validateAuthInput('verify-otp'),
  async (req, res) => {
    const { email, code } = req.body;

    const pending =
      pendingOtps.get(email);

    if (!pending) {
      return res.status(400).json({
        error:
          'No verification code was requested.',
      });
    }

    if (
      Date.now() >
      pending.expiresAt
    ) {
      pendingOtps.delete(email);

      return res.status(400).json({
        error:
          'Verification code has expired.',
      });
    }

    const submittedHash =
      hashOtp(email, code);

    if (
      submittedHash !== pending.hash
    ) {
      return res.status(400).json({
        error:
          'Invalid verification code.',
      });
    }

    pendingOtps.delete(email);

    verifiedEmails.set(
      email,
      Date.now() + OTP_TTL_MS
    );

    res.json({
      message:
        'Email verified successfully.',
      verified: true,
    });
  }
);

/* =========================================================
   AUTH — LOGIN
========================================================= */

app.post('/api/auth/login', validateAuthInput('login'), createLoginHandler({
  pool, authStore, security: loginSecurity, recovery,
}));
app.post('/api/auth/forgot-password', validateAuthInput('forgot-password'), recovery.requestReset);
app.post('/api/auth/reset-password', validateAuthInput('reset-password'), recovery.resetPassword);

/* =========================================================
   AUTH — REFRESH TOKEN
========================================================= */

app.post(
  '/api/auth/refresh',
  async (req, res) => {
    const refreshToken = String(
      req.body?.refreshToken || ''
    ).trim();

    if (!refreshToken) {
      return res.status(401).json({
        error:
          'Refresh token is required.',
      });
    }

    const userId =
      authStore.sessions.get(
        refreshToken
      );

    if (
      userId === undefined ||
      !Number.isFinite(
        Number(userId)
      )
    ) {
      return res.status(401).json({
        error:
          'Invalid or expired refresh token.',
      });
    }

    /*
     * Revoke the old refresh token and
     * issue a new access token.
     */
    authStore.revokeToken(
      refreshToken
    );

    const accessToken =
      authStore.issueToken(
        Number(userId)
      );

    /*
     * Keep the Flutter contract simple:
     * refresh returns an accessToken.
     *
     * A new refresh token is also returned
     * so the client can rotate it if needed.
     */
    const newRefreshToken =
      authStore.issueToken(
        Number(userId)
      );

    res.json({
      accessToken,
      refreshToken:
        newRefreshToken,
    });
  }
);

/* =========================================================
   AUTH — LOGOUT
========================================================= */

app.post(
  '/api/auth/logout',
  async (req, res) => {
    try {
      const bodyRefreshToken =
        String(
          req.body?.refreshToken || ''
        ).trim();

      const bearerToken =
        getBearerToken(req);

      const token =
        bodyRefreshToken ||
        bearerToken;

      if (token) {
        authStore.revokeToken(
          token
        );
      }

      res.json({
        message:
          'Logged out successfully.',
      });
    } catch (error) {
      console.error(
        'Logout failed:',
        { code: error.code }
      );

      res.status(500).json({
        error: 'Logout failed.',
      });
    }
  }
);

/* =========================================================
   AUTH — CURRENT USER
========================================================= */

app.get(
  '/api/auth/me',
  authenticate,
  async (req, res) => {
    try {
      const userId =
        Number(req.authUserId);

      if (
        !Number.isFinite(userId)
      ) {
        return res.status(401).json({
          error: 'Unauthorized.',
        });
      }

      const [rows] = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          phone,
          birthdate,
          role,
          created_at
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          error:
            'User account not found.',
        });
      }

      const user = rows[0];

      res.json({
        id: String(user.id),
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        birthDate: user.birthdate,
        role: user.role,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error(
        'Get current user failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve user information.',
      });
    }
  }
);

/* =========================================================
   AUTH — UPDATE PROFILE
========================================================= */

app.put(
  '/api/auth/me',
  authenticate,
  async (req, res) => {
    const phone =
      req.body?.phone ?? null;

    const birthDate =
      req.body?.birthDate ??
      req.body?.birthdate ??
      null;

    try {
      const userId =
        Number(req.authUserId);

      await pool.query(
        `
        UPDATE users
        SET
          phone = ?,
          birthdate = ?
        WHERE id = ?
        `,
        [
          phone,
          birthDate,
          userId,
        ]
      );

      const [rows] =
        await pool.query(
          `
          SELECT
            id,
            name,
            email,
            phone,
            birthdate,
            role,
            created_at
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [userId]
        );

      if (rows.length === 0) {
        return res.status(404).json({
          error:
            'User account not found.',
        });
      }

      const user = rows[0];

      res.json({
        id: String(user.id),
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        birthDate: user.birthdate,
        role: user.role,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error(
        'Update profile failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update profile.',
      });
    }
  }
);

/* =========================================================
   MEDICINES API
========================================================= */

/*
 * GET /api/medicines
 *
 * Returns medicines available from partner drugstores.
 * The price and stock come from inventory.
 */
app.get('/api/medicines', async (req, res) => {
  const search = String(
    req.query.search || ''
  ).trim();

  const category = String(
    req.query.category || ''
  ).trim();

  try {
    let sql = `
      SELECT
        m.id AS id,
        m.brand_name AS name,
        m.generic_name AS genericName,
        i.price AS price,
        ds.name AS drugstoreName,
        ds.id AS drugstoreId,
        m.dosage_form AS category,
        i.stock_count AS stockCount,
        m.rx_required AS rxRequired,
        m.description AS description,
        i.created_at AS createdAt,
        NULL AS distance
      FROM inventory i
      JOIN medicines m
        ON m.id = i.medicine_id
      JOIN drugstores ds
        ON ds.id = i.drugstore_id
      WHERE ds.is_active = 1
        AND i.availability = 1
    `;

    const params = [];

    if (search) {
      sql += `
        AND (
          m.brand_name LIKE ?
          OR m.generic_name LIKE ?
          OR m.description LIKE ?
        )
      `;

      const searchValue = `%${search}%`;

      params.push(
        searchValue,
        searchValue,
        searchValue
      );
    }

    if (category) {
      sql += `
        AND m.category = ?
      `;

      params.push(category);
    }

    sql += `
      ORDER BY
        m.brand_name ASC,
        ds.name ASC
    `;

    const [rows] = await pool.query(
      sql,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error(
      'Get medicines failed:',
      { code: error.code }
    );

    res.status(500).json({
      error:
        'Unable to retrieve medicines.',
    });
  }
});

/* =========================================================
   MEDICINE — GET SINGLE MEDICINE
========================================================= */

app.get(
  '/api/medicines/:id',
  async (req, res) => {
    const medicineId =
      Number(req.params.id);

    if (
      !Number.isInteger(medicineId) ||
      medicineId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid medicine ID.',
      });
    }

    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            m.id AS id,
            m.brand_name AS name,
            m.generic_name AS genericName,
            m.dosage_form AS dosageForm,
            m.category AS category,
            m.rx_required AS rxRequired,
            m.description AS description,
            m.created_at AS createdAt
          FROM medicines m
          WHERE m.id = ?
          LIMIT 1
          `,
          [medicineId]
        );

      if (rows.length === 0) {
        return res.status(404).json({
          error:
            'Medicine not found.',
        });
      }

      const medicine = rows[0];

      /*
       * Also return the partner drugstores
       * carrying this medicine.
       */
      const [inventoryRows] =
        await pool.query(
          `
          SELECT
            i.id AS inventoryId,
            i.drugstore_id AS drugstoreId,
            ds.name AS drugstoreName,
            ds.address AS address,
            ds.latitude AS latitude,
            ds.longitude AS longitude,
            i.price AS price,
            i.stock_count AS stockCount,
            i.availability AS availability
          FROM inventory i
          JOIN drugstores ds
            ON ds.id = i.drugstore_id
          WHERE i.medicine_id = ?
            AND ds.is_active = 1
          ORDER BY ds.name ASC
          `,
          [medicineId]
        );

      res.json({
        ...medicine,
        inventory: inventoryRows,
      });
    } catch (error) {
      console.error(
        'Get medicine failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve medicine.',
      });
    }
  }
);

/* =========================================================
   STORES / DRUGSTORES
========================================================= */

/*
 * Convert the stored operating-hours text into
 * a simple openNow value when possible.
 *
 * The database currently stores operating_hours
 * as VARCHAR, so this intentionally does not assume
 * a specific format.
 */
function calculateOpenNow(
  operatingHours,
  isActive
) {
  if (!isActive) {
    return false;
  }

  if (!operatingHours) {
    return false;
  }

  const value = String(
    operatingHours
  ).trim();

  /*
   * Supported examples:
   * 08:00-20:00
   * 8:00 AM - 8:00 PM
   *
   * If the stored format cannot be safely parsed,
   * return false rather than guessing.
   */
  const match = value.match(
    /(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i
  );

  if (!match) {
    return false;
  }

  try {
    const now = new Date();

    const parseTime = (
      hourText,
      minuteText,
      ampm
    ) => {
      let hour =
        Number(hourText);

      const minute =
        Number(minuteText || 0);

      if (ampm) {
        const period =
          ampm.toUpperCase();

        if (
          period === 'PM' &&
          hour !== 12
        ) {
          hour += 12;
        }

        if (
          period === 'AM' &&
          hour === 12
        ) {
          hour = 0;
        }
      }

      return (
        hour * 60 +
        minute
      );
    };

    const start =
      parseTime(
        match[1],
        match[2],
        match[3]
      );

    const end =
      parseTime(
        match[4],
        match[5],
        match[6]
      );

    const current =
      now.getHours() * 60 +
      now.getMinutes();

    /*
     * Handles normal hours and overnight hours.
     */
    if (end >= start) {
      return (
        current >= start &&
        current <= end
      );
    }

    return (
      current >= start ||
      current <= end
    );
  } catch {
    return false;
  }
}

/* =========================================================
   GET ALL STORES
========================================================= */

app.get('/api/stores', async (req, res) => {
  try {
    const [rows] =
      await pool.query(
        `
        SELECT
          id AS store_id,
          name AS store_name,
          address,
          latitude,
          longitude,
          operating_hours,
          is_active
        FROM drugstores
        WHERE is_active = 1
        ORDER BY name ASC
        `
      );

    const stores = rows.map(
      (store) => ({
        ...store,
        openNow:
          calculateOpenNow(
            store.operating_hours,
            store.is_active
          ),
      })
    );

    res.json(stores);
  } catch (error) {
    console.error(
      'Get stores failed:',
      { code: error.code }
    );

    res.status(500).json({
      error:
        'Unable to retrieve drugstores.',
    });
  }
});

/* =========================================================
   GET SINGLE STORE
========================================================= */

app.get(
  '/api/stores/:id',
  async (req, res) => {
    const storeId =
      Number(req.params.id);

    if (
      !Number.isInteger(storeId) ||
      storeId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid drugstore ID.',
      });
    }

    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            id AS store_id,
            name AS store_name,
            address,
            latitude,
            longitude,
            operating_hours,
            is_active
          FROM drugstores
          WHERE id = ?
          LIMIT 1
          `,
          [storeId]
        );

      if (rows.length === 0) {
        return res.status(404).json({
          error:
            'Drugstore not found.',
        });
      }

      const store = rows[0];

      res.json({
        ...store,
        openNow:
          calculateOpenNow(
            store.operating_hours,
            store.is_active
          ),
      });
    } catch (error) {
      console.error(
        'Get store failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve drugstore.',
      });
    }
  }
);

/* =========================================================
   STORE INVENTORY
========================================================= */

app.get(
  '/api/stores/:id/inventory',
  async (req, res) => {
    const storeId =
      Number(req.params.id);

    if (
      !Number.isInteger(storeId) ||
      storeId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid drugstore ID.',
      });
    }

    try {
      const [storeRows] =
        await pool.query(
          `
          SELECT
            id,
            name,
            address,
            latitude,
            longitude,
            operating_hours,
            is_active
          FROM drugstores
          WHERE id = ?
          LIMIT 1
          `,
          [storeId]
        );

      if (storeRows.length === 0) {
        return res.status(404).json({
          error:
            'Drugstore not found.',
        });
      }

      const [rows] =
        await pool.query(
          `
          SELECT
            m.id AS id,
            m.brand_name AS name,
            m.generic_name AS genericName,
            i.price AS price,
            ds.name AS drugstoreName,
            ds.id AS drugstoreId,
            m.dosage_form AS category,
            m.category AS medicineCategory,
            i.stock_count AS stockCount,
            i.availability AS availability,
            m.rx_required AS rxRequired,
            m.description AS description,
            i.created_at AS createdAt,
            NULL AS distance
          FROM inventory i
          JOIN medicines m
            ON m.id = i.medicine_id
          JOIN drugstores ds
            ON ds.id = i.drugstore_id
          WHERE ds.id = ?
          ORDER BY m.brand_name ASC
          `,
          [storeId]
        );

      res.json({
        store: {
          store_id:
            storeRows[0].id,
          store_name:
            storeRows[0].name,
          address:
            storeRows[0].address,
          latitude:
            storeRows[0].latitude,
          longitude:
            storeRows[0].longitude,
          operating_hours:
            storeRows[0].operating_hours,
          is_active:
            storeRows[0].is_active,
          openNow:
            calculateOpenNow(
              storeRows[0]
                .operating_hours,
              storeRows[0]
                .is_active
            ),
        },
        inventory: rows,
      });
    } catch (error) {
      console.error(
        'Get store inventory failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve store inventory.',
      });
    }
  }
);

/* =========================================================
   CUSTOMER ORDERS
========================================================= */

/*
 * The current database uses this structure:
 *
 * orders
 *   ↓
 * order_drugstores
 *   ↓
 * order_items
 *   ↓
 * medicines
 *
 * This keeps one customer order connected to
 * one or more partner drugstores.
 */

/* =========================================================
   CREATE CUSTOMER ORDER
========================================================= */

app.post(
  '/api/orders',
  authenticate,
  async (req, res) => {
    const userId =
      Number(req.authUserId);

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(401).json({
        error: 'Unauthorized.',
      });
    }

    const requestItems =
      Array.isArray(req.body?.items)
        ? req.body.items
        : [];

    if (requestItems.length === 0) {
      return res.status(400).json({
        error:
          'At least one medicine is required.',
      });
    }

    /*
     * Validate and normalize the incoming
     * cart items before starting the transaction.
     */
    const normalizedItems = [];

    for (const item of requestItems) {
      const medicineId = Number(
        item?.id
      );

      const drugstoreId = Number(
        item?.drugstoreId
      );

      const quantity = Number(
        item?.quantity
      );

      if (
        !Number.isInteger(
          medicineId
        ) ||
        medicineId <= 0
      ) {
        return res.status(400).json({
          error:
            'Invalid medicine in order.',
        });
      }

      if (
        !Number.isInteger(
          drugstoreId
        ) ||
        drugstoreId <= 0
      ) {
        return res.status(400).json({
          error:
            'Invalid drugstore in order.',
        });
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          error:
            'Order quantity must be greater than zero.',
        });
      }

      normalizedItems.push({
        medicineId,
        drugstoreId,
        quantity,
      });
    }

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      /*
       * Make sure the customer account still exists.
       */
      const [userRows] =
        await connection.query(
          `
          SELECT
            id,
            name,
            email
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [userId]
        );

      if (userRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          error:
            'Customer account not found.',
        });
      }

      /*
       * Combine duplicate medicine/store entries.
       *
       * Example:
       *
       * Medicine 1 + Store 1 + Qty 1
       * Medicine 1 + Store 1 + Qty 2
       *
       * becomes:
       *
       * Medicine 1 + Store 1 + Qty 3
       */
      const groupedItems =
        new Map();

      for (const item of normalizedItems) {
        const key =
          `${item.drugstoreId}:${item.medicineId}`;

        if (
          groupedItems.has(key)
        ) {
          groupedItems.get(key)
            .quantity +=
            item.quantity;
        } else {
          groupedItems.set(
            key,
            {
              ...item,
            }
          );
        }
      }

      const finalItems =
        Array.from(
          groupedItems.values()
        );

      /*
       * Group items by drugstore.
       */
      const itemsByDrugstore =
        new Map();

      for (const item of finalItems) {
        if (
          !itemsByDrugstore.has(
            item.drugstoreId
          )
        ) {
          itemsByDrugstore.set(
            item.drugstoreId,
            []
          );
        }

        itemsByDrugstore
          .get(item.drugstoreId)
          .push(item);
      }

      /*
       * We calculate the total using the
       * database price, NOT the price sent
       * by the mobile application.
       *
       * This prevents a client from changing
       * the item price before checkout.
       */
      let orderTotal = 0;

      const verifiedItems = [];

      for (
        const item of finalItems
      ) {
        /*
         * Lock the inventory row while the
         * transaction is being processed.
         */
        const [inventoryRows] =
          await connection.query(
            `
            SELECT
              i.id AS inventoryId,
              i.drugstore_id AS drugstoreId,
              i.medicine_id AS medicineId,
              i.price AS price,
              i.stock_count AS stockCount,
              i.availability AS availability,
              m.brand_name AS medicineName,
              m.rx_required AS rxRequired,
              ds.name AS drugstoreName
            FROM inventory i
            JOIN medicines m
              ON m.id = i.medicine_id
            JOIN drugstores ds
              ON ds.id = i.drugstore_id
            WHERE i.drugstore_id = ?
              AND i.medicine_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [
              item.drugstoreId,
              item.medicineId,
            ]
          );

        if (
          inventoryRows.length === 0
        ) {
          throw new Error(
            `Medicine ${item.medicineId} is not available at drugstore ${item.drugstoreId}.`
          );
        }

        const inventory =
          inventoryRows[0];

        if (
          Number(
            inventory.availability
          ) !== 1
        ) {
          throw new Error(
            `${inventory.medicineName} is currently unavailable at ${inventory.drugstoreName}.`
          );
        }

        const stockCount =
          Number(
            inventory.stockCount
          );

        if (
          stockCount <
          item.quantity
        ) {
          throw new Error(
            `Not enough stock for ${inventory.medicineName} at ${inventory.drugstoreName}. Available stock: ${stockCount}.`
          );
        }

        const price =
          Number(
            inventory.price
          );

        const lineTotal =
          price *
          item.quantity;

        orderTotal +=
          lineTotal;

        verifiedItems.push({
          ...item,
          inventoryId:
            inventory.inventoryId,
          price,
          lineTotal,
          medicineName:
            inventory.medicineName,
          drugstoreName:
            inventory.drugstoreName,
          rxRequired:
            Number(
              inventory.rxRequired
            ) === 1,
        });
      }

      /*
       * Create the main order.
       *
       * The current database does not contain
       * pickupDate, pickupTime, or paymentPlan
       * columns, so those values are not inserted
       * into nonexistent columns.
       *
       * They can be added to the schema later if
       * the frontend requires them to be persisted.
       */
      const reference =
        generateOrderReference();

      /*
       * NearPill's order expiration is 3 days.
       */
      const expiresAt =
        new Date(
          Date.now() +
            3 * 24 * 60 * 60 * 1000
        );

      const [orderResult] =
        await connection.query(
          `
          INSERT INTO orders
            (
              reference,
              user_id,
              total,
              status,
              expires_at
            )
          VALUES
            (?, ?, ?, 'pending', ?)
          `,
          [
            reference,
            userId,
            orderTotal.toFixed(2),
            expiresAt,
          ]
        );

      const orderId =
        Number(
          orderResult.insertId
        );

      /*
       * Create one order_drugstores record
       * for every partner drugstore involved.
       */
      const orderDrugstoreIds =
        new Map();

      for (
        const [
          drugstoreId,
          storeItems,
        ] of itemsByDrugstore
      ) {
        /*
         * Verify that the drugstore exists
         * and is active.
         */
        const [storeRows] =
          await connection.query(
            `
            SELECT
              id,
              name,
              is_active
            FROM drugstores
            WHERE id = ?
            LIMIT 1
            `,
            [drugstoreId]
          );

        if (
          storeRows.length === 0
        ) {
          throw new Error(
            `Drugstore ${drugstoreId} does not exist.`
          );
        }

        if (
          Number(
            storeRows[0].is_active
          ) !== 1
        ) {
          throw new Error(
            `${storeRows[0].name} is currently inactive.`
          );
        }

        const [orderDrugstoreResult] =
          await connection.query(
            `
            INSERT INTO order_drugstores
              (
                order_id,
                drugstore_id,
                status
              )
            VALUES
              (?, ?, 'pending')
            `,
            [
              orderId,
              drugstoreId,
            ]
          );

        orderDrugstoreIds.set(
          drugstoreId,
          Number(
            orderDrugstoreResult
              .insertId
          )
        );
      }

      /*
       * Insert every medicine into order_items.
       */
      for (
        const item of verifiedItems
      ) {
        const orderDrugstoreId =
          orderDrugstoreIds.get(
            item.drugstoreId
          );

        if (
          !orderDrugstoreId
        ) {
          throw new Error(
            'Unable to connect order item to drugstore.'
          );
        }

        await connection.query(
          `
          INSERT INTO order_items
            (
              order_drugstore_id,
              medicine_id,
              quantity,
              price
            )
          VALUES
            (?, ?, ?, ?)
          `,
          [
            orderDrugstoreId,
            item.medicineId,
            item.quantity,
            item.price,
          ]
        );

        /*
         * Reserve/reduce stock immediately
         * after the order is created.
         */
        const [updateResult] =
          await connection.query(
            `
            UPDATE inventory
            SET
              stock_count =
                stock_count - ?
            WHERE
              drugstore_id = ?
              AND medicine_id = ?
              AND stock_count >= ?
            `,
            [
              item.quantity,
              item.drugstoreId,
              item.medicineId,
              item.quantity,
            ]
          );

        if (
          updateResult.affectedRows !== 1
        ) {
          throw new Error(
            `Unable to reserve stock for ${item.medicineName}.`
          );
        }
      }

      /*
       * Create the initial payment record.
       *
       * The current payment table supports:
       * pending, paid, refunded, failed.
       *
       * The exact GCash transaction will be
       * connected later when the GCash API is integrated.
       */
      await connection.query(
        `
        INSERT INTO payments
          (
            order_id,
            amount,
            payment_method,
            payment_status
          )
        VALUES
          (?, ?, 'GCash', 'pending')
        `,
        [
          orderId,
          orderTotal.toFixed(2),
        ]
      );

      /*
       * Audit trail.
       */
      await connection.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'CREATE_ORDER', ?)
        `,
        [
          userId,
          `Created order ${reference} with total ${orderTotal.toFixed(2)}.`,
        ]
      );

      await connection.commit();

      /*
       * Frontend currently expects:
       * reference
       * storeName
       *
       * If multiple stores are involved,
       * return a combined store name.
       */
      const storeNames =
        Array.from(
          new Set(
            verifiedItems.map(
              (item) =>
                item.drugstoreName
            )
          )
        );

      res.status(201).json({
        id: orderId,
        reference,
        total: Number(
          orderTotal.toFixed(2)
        ),
        status: 'pending',
        stage: 'pending',
        expiresAt,
        storeName:
          storeNames.join(', '),
        stores: storeNames,
        items:
          verifiedItems.map(
            (item) => ({
              id: item.medicineId,
              name:
                item.medicineName,
              price: item.price,
              quantity:
                item.quantity,
              drugstoreId:
                item.drugstoreId,
              drugstoreName:
                item.drugstoreName,
              rxRequired:
                item.rxRequired,
            })
          ),
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors.
      }

      console.error(
        'Create order failed:',
        { code: error.code }
      );

      res.status(400).json({
        error:
          error.message ||
          'Unable to create order.',
      });
    } finally {
      connection.release();
    }
  }
);

/* =========================================================
   GET CUSTOMER ORDERS
========================================================= */

app.get(
  '/api/orders',
  authenticate,
  async (req, res) => {
    const userId =
      Number(req.authUserId);

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(401).json({
        error: 'Unauthorized.',
      });
    }

    try {
      /*
       * First get the customer's orders.
       */
      const [orders] =
        await pool.query(
          `
          SELECT
            o.id,
            o.reference,
            o.total,
            o.status,
            o.rejection_reason AS rejectionReason,
            o.created_at AS createdAt,
            o.expires_at AS expiresAt
          FROM orders o
          WHERE o.user_id = ?
          ORDER BY
            o.created_at DESC
          `,
          [userId]
        );

      if (orders.length === 0) {
        return res.json([]);
      }

      const orderIds =
        orders.map(
          (order) =>
            Number(order.id)
        );

      /*
       * Get all items belonging to the
       * customer's orders.
       */
      const placeholders =
        orderIds
          .map(() => '?')
          .join(',');

      const [itemRows] =
        await pool.query(
          `
          SELECT
            od.order_id AS orderId,
            oi.id AS orderItemId,
            oi.medicine_id AS medicineId,
            oi.quantity,
            oi.price,
            od.drugstore_id AS drugstoreId,
            od.status AS drugstoreStatus,
            od.rejection_reason AS rejectionReason,
            ds.name AS drugstoreName,
            m.brand_name AS medicineName,
            m.generic_name AS genericName,
            m.rx_required AS rxRequired
          FROM order_drugstores od
          JOIN order_items oi
            ON oi.order_drugstore_id = od.id
          JOIN drugstores ds
            ON ds.id = od.drugstore_id
          JOIN medicines m
            ON m.id = oi.medicine_id
          WHERE od.order_id IN (${placeholders})
          ORDER BY
            od.order_id DESC,
            oi.id ASC
          `,
          orderIds
        );

      /*
       * Build the response expected by
       * the Flutter order service.
       */
      const result = orders.map(
        (order) => {
          const items =
            itemRows
              .filter(
                (item) =>
                  Number(
                    item.orderId
                  ) ===
                  Number(order.id)
              )
              .map(
                (item) => ({
                  id: Number(
                    item.medicineId
                  ),
                  name:
                    item.medicineName,
                  genericName:
                    item.genericName,
                  price: Number(
                    item.price
                  ),
                  quantity: Number(
                    item.quantity
                  ),
                  drugstoreId:
                    Number(
                      item.drugstoreId
                    ),
                  drugstoreName:
                    item.drugstoreName,
                  rxRequired:
                    Number(
                      item.rxRequired
                    ) === 1,
                  status:
                    item.drugstoreStatus,
                })
              );

          const storeNames =
            Array.from(
              new Set(
                items.map(
                  (item) =>
                    item.drugstoreName
                )
              )
            );

          const itemCount =
            items.reduce(
              (sum, item) =>
                sum +
                Number(
                  item.quantity
                ),
              0
            );

          const itemSummary =
            items
              .map(
                (item) =>
                  `${item.name} x${item.quantity}`
              )
              .join(', ');

          return {
            id: Number(
              order.id
            ),
            reference:
              order.reference,
            storeName:
              storeNames.join(', '),
            itemSummary,
            itemCount,
            total: Number(
              order.total
            ),
            status:
              order.status,
            stage:
              order.status,
            rejectionReason:
              order.rejectionReason,
            placedOn:
              formatDate(
                order.createdAt
              ),
            createdAt:
              order.createdAt,
            expiresAt:
              order.expiresAt,
            items,
          };
        }
      );

      res.json(result);
    } catch (error) {
      console.error(
        'Get customer orders failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve orders.',
      });
    }
  }
);

/* =========================================================
   GET SINGLE CUSTOMER ORDER
========================================================= */

app.get(
  '/api/orders/:id',
  authenticate,
  async (req, res) => {
    const userId =
      Number(req.authUserId);

    const orderId =
      Number(req.params.id);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    try {
      const [orders] =
        await pool.query(
          `
          SELECT
            o.id,
            o.reference,
            o.total,
            o.status,
            o.rejection_reason AS rejectionReason,
            o.created_at AS createdAt,
            o.expires_at AS expiresAt
          FROM orders o
          WHERE o.id = ?
            AND o.user_id = ?
          LIMIT 1
          `,
          [
            orderId,
            userId,
          ]
        );

      if (orders.length === 0) {
        return res.status(404).json({
          error:
            'Order not found.',
        });
      }

      const order = orders[0];

      const [items] =
        await pool.query(
          `
          SELECT
            oi.id AS orderItemId,
            oi.medicine_id AS medicineId,
            oi.quantity,
            oi.price,
            od.drugstore_id AS drugstoreId,
            od.status AS drugstoreStatus,
            od.rejection_reason AS drugstoreRejectionReason,
            ds.name AS drugstoreName,
            m.brand_name AS medicineName,
            m.generic_name AS genericName,
            m.rx_required AS rxRequired
          FROM order_drugstores od
          JOIN order_items oi
            ON oi.order_drugstore_id = od.id
          JOIN drugstores ds
            ON ds.id = od.drugstore_id
          JOIN medicines m
            ON m.id = oi.medicine_id
          WHERE od.order_id = ?
          ORDER BY oi.id ASC
          `,
          [orderId]
        );

      const formattedItems =
        items.map(
          (item) => ({
            id: Number(
              item.medicineId
            ),
            name:
              item.medicineName,
            genericName:
              item.genericName,
            price: Number(
              item.price
            ),
            quantity: Number(
              item.quantity
            ),
            drugstoreId:
              Number(
                item.drugstoreId
              ),
            drugstoreName:
              item.drugstoreName,
            rxRequired:
              Number(
                item.rxRequired
              ) === 1,
            status:
              item.drugstoreStatus,
            rejectionReason:
              item.drugstoreRejectionReason,
          })
        );

      const storeNames =
        Array.from(
          new Set(
            formattedItems.map(
              (item) =>
                item.drugstoreName
            )
          )
        );

      res.json({
        id: Number(order.id),
        reference:
          order.reference,
        total: Number(
          order.total
        ),
        status:
          order.status,
        stage:
          order.status,
        rejectionReason:
          order.rejectionReason,
        storeName:
          storeNames.join(', '),
        placedOn:
          formatDate(
            order.createdAt
          ),
        createdAt:
          order.createdAt,
        expiresAt:
          order.expiresAt,
        items:
          formattedItems,
      });
    } catch (error) {
      console.error(
        'Get single order failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve order.',
      });
    }
  }
);

/* =========================================================
   ADMIN API
========================================================= */

/*
 * The admin portal currently uses these endpoints:
 *
 * GET  /api/admin/metrics
 * GET  /api/admin/pharmacies
 * GET  /api/admin/orders
 *
 * Additional admin management endpoints are added
 * in the following parts.
 */

/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */

async function getAuthenticatedUser(
  userId
) {
  const [rows] =
    await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

async function requireAdmin(
  req,
  res,
  next
) {
  try {
    const userId =
      Number(req.authUserId);

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(401).json({
        error: 'Unauthorized.',
      });
    }

    const user =
      await getAuthenticatedUser(
        userId
      );

    if (!user) {
      return res.status(401).json({
        error:
          'User account not found.',
      });
    }

    if (
      user.role !== 'admin'
    ) {
      return res.status(403).json({
        error:
          'Administrator access required.',
      });
    }

    req.authUser = user;

    next();
  } catch (error) {
    console.error(
      'Admin authorization failed:',
      { code: error.code }
    );

    res.status(500).json({
      error:
        'Unable to verify administrator access.',
    });
  }
}

/* =========================================================
   ADMIN METRICS
========================================================= */

app.get(
  '/api/admin/metrics',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      /*
       * Total GMV / sales.
       *
       * This is calculated from orders.
       */
      const [gmvRows] =
        await pool.query(
          `
          SELECT
            COALESCE(
              SUM(total),
              0
            ) AS totalGMV
          FROM orders
          WHERE status <> 'cancelled'
          `
        );

      /*
       * Number of active partner drugstores.
       */
      const [pharmacyRows] =
        await pool.query(
          `
          SELECT
            COUNT(*) AS activePharmaciesCount
          FROM drugstores
          WHERE is_active = 1
          `
        );

      /*
       * Total orders.
       */
      const [orderRows] =
        await pool.query(
          `
          SELECT
            COUNT(*) AS totalOrdersCount
          FROM orders
          `
        );

      /*
       * The current schema does not contain
       * a dedicated rx verification table/field.
       *
       * We therefore only count orders whose
       * status explicitly represents an RX
       * verification state, if such statuses exist.
       */
      const [rxRows] =
        await pool.query(
          `
          SELECT
            COUNT(*) AS rxPendingVerificationCount
          FROM orders
          WHERE LOWER(status) IN (
            'rx_pending',
            'pending_rx',
            'rx_verification_pending'
          )
          `
        );

      res.json({
        totalGMV: Number(
          gmvRows[0]
            .totalGMV || 0
        ),

        activePharmaciesCount:
          Number(
            pharmacyRows[0]
              .activePharmaciesCount ||
              0
          ),

        totalOrdersCount:
          Number(
            orderRows[0]
              .totalOrdersCount ||
              0
          ),

        rxPendingVerificationCount:
          Number(
            rxRows[0]
              .rxPendingVerificationCount ||
              0
          ),
      });
    } catch (error) {
      console.error(
        'Get admin metrics failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve admin metrics.',
      });
    }
  }
);

/* =========================================================
   ADMIN — PHARMACY DETAILS
========================================================= */

/*
 * These extra fields are kept in memory because
 * the current drugstores table does NOT contain:
 *
 * slug
 * email
 * licenseNo
 * manager
 * rating
 *
 * The actual persistent fields are:
 *
 * id
 * name
 * address
 * latitude
 * longitude
 * operating_hours
 * is_active
 * created_at
 *
 * The map below prevents the frontend contract
 * from breaking while the database remains unchanged.
 */

const storeDetailsMap =
  new Map();

/* =========================================================
   ADMIN — GET PHARMACIES
========================================================= */

app.get(
  '/api/admin/pharmacies',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            ds.id AS store_id,
            ds.id AS id,
            ds.name,
            ds.address,
            ds.latitude,
            ds.longitude,
            ds.operating_hours,
            ds.is_active,
            ds.created_at
          FROM drugstores ds
          ORDER BY
            ds.name ASC
          `
        );

      /*
       * Get order and sales totals per drugstore.
       */
      const [salesRows] =
        await pool.query(
          `
          SELECT
            od.drugstore_id AS drugstoreId,
            COUNT(
              DISTINCT od.order_id
            ) AS totalOrders,
            COALESCE(
              SUM(
                oi.quantity * oi.price
              ),
              0
            ) AS totalSales
          FROM order_drugstores od
          JOIN order_items oi
            ON oi.order_drugstore_id =
               od.id
          WHERE od.status <> 'cancelled'
          GROUP BY
            od.drugstore_id
          `
        );

      const salesMap =
        new Map(
          salesRows.map(
            (row) => [
              Number(
                row.drugstoreId
              ),
              {
                totalOrders:
                  Number(
                    row.totalOrders
                  ),
                totalSales:
                  Number(
                    row.totalSales
                  ),
              },
            ]
          )
        );

      const pharmacies =
        rows.map(
          (store) => {
            const id =
              Number(
                store.store_id
              );

            const details =
              storeDetailsMap.get(
                id
              ) || {};

            const sales =
              salesMap.get(id) || {
                totalOrders: 0,
                totalSales: 0,
              };

            return {
              id,
              store_id: id,

              /*
               * Generate a frontend-friendly
               * slug without storing a new
               * database column.
               */
              slug:
                details.slug ||
                String(
                  store.name || ''
                )
                  .toLowerCase()
                  .trim()
                  .replace(
                    /[^a-z0-9]+/g,
                    '-'
                  )
                  .replace(
                    /^-+|-+$/g,
                    ''
                  ),

              name:
                store.name,

              address:
                store.address,

              email:
                details.email ||
                null,

              licenseNo:
                details.licenseNo ||
                null,

              manager:
                details.manager ||
                null,

              status:
                Number(
                  store.is_active
                ) === 1
                  ? 'active'
                  : 'inactive',

              rating:
                details.rating ??
                null,

              latitude:
                store.latitude,

              longitude:
                store.longitude,

              operatingHours:
                store.operating_hours,

              totalOrders:
                sales.totalOrders,

              totalSales:
                sales.totalSales,

              createdAt:
                store.created_at,
            };
          }
        );

      res.json(
        pharmacies
      );
    } catch (error) {
      console.error(
        'Get admin pharmacies failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve pharmacies.',
      });
    }
  }
);

/* =========================================================
   ADMIN — GET ORDERS
========================================================= */

app.get(
  '/api/admin/orders',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [orders] =
        await pool.query(
          `
          SELECT
            o.id,
            o.reference,
            o.total,
            o.status,
            o.rejection_reason
              AS rejectionReason,
            o.created_at
              AS createdAt,
            o.expires_at
              AS expiresAt,
            u.name
              AS customerName,
            u.email
              AS customerEmail
          FROM orders o
          JOIN users u
            ON u.id = o.user_id
          ORDER BY
            o.created_at DESC
          `
        );

      if (orders.length === 0) {
        return res.json([]);
      }

      const orderIds =
        orders.map(
          (order) =>
            Number(order.id)
        );

      const placeholders =
        orderIds
          .map(() => '?')
          .join(',');

      /*
       * Retrieve all drugstores and items
       * connected to these orders.
       */
      const [itemRows] =
        await pool.query(
          `
          SELECT
            od.order_id AS orderId,
            od.drugstore_id AS drugstoreId,
            od.status AS drugstoreStatus,
            od.rejection_reason
              AS drugstoreRejectionReason,
            ds.name AS storeName,
            oi.medicine_id AS medicineId,
            oi.quantity,
            oi.price,
            m.brand_name AS medicineName,
            m.generic_name AS genericName,
            m.rx_required AS rxRequired
          FROM order_drugstores od
          JOIN order_items oi
            ON oi.order_drugstore_id =
               od.id
          JOIN drugstores ds
            ON ds.id =
               od.drugstore_id
          JOIN medicines m
            ON m.id =
               oi.medicine_id
          WHERE od.order_id IN (
            ${placeholders}
          )
          ORDER BY
            od.order_id DESC,
            oi.id ASC
          `,
          orderIds
        );

      const result =
        orders.map(
          (order) => {
            const orderItems =
              itemRows.filter(
                (item) =>
                  Number(
                    item.orderId
                  ) ===
                  Number(
                    order.id
                  )
              );

            const storeNames =
              Array.from(
                new Set(
                  orderItems.map(
                    (item) =>
                      item.storeName
                  )
                )
              );

            const items =
              orderItems.map(
                (item) => ({
                  id: Number(
                    item.medicineId
                  ),
                  name:
                    item.medicineName,
                  genericName:
                    item.genericName,
                  quantity:
                    Number(
                      item.quantity
                    ),
                  price:
                    Number(
                      item.price
                    ),
                  drugstoreId:
                    Number(
                      item.drugstoreId
                    ),
                  drugstoreName:
                    item.storeName,
                  rxRequired:
                    Number(
                      item.rxRequired
                    ) === 1,
                  status:
                    item.drugstoreStatus,
                })
              );

            /*
             * "stage" is kept because the
             * existing admin frontend expects it.
             */
            return {
              id: Number(
                order.id
              ),

              reference:
                order.reference,

              customerName:
                order.customerName,

              customerEmail:
                order.customerEmail,

              storeName:
                storeNames.join(', '),

              store_id:
                storeNames.length ===
                1
                  ? Number(
                      orderItems[0]
                        ?.drugstoreId
                    )
                  : null,

              items,

              total:
                Number(
                  order.total
                ),

              status:
                order.status,

              stage:
                order.status,

              rejectionReason:
                order.rejectionReason,

              placedOn:
                formatDate(
                  order.createdAt
                ),

              createdAt:
                order.createdAt,

              expiresAt:
                order.expiresAt,
            };
          }
        );

      res.json(result);
    } catch (error) {
      console.error(
        'Get admin orders failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve admin orders.',
      });
    }
  }
);

/* =========================================================
   ADMIN — GET SINGLE ORDER
========================================================= */

app.get(
  '/api/admin/orders/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const orderId =
      Number(req.params.id);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    try {
      const [orders] =
        await pool.query(
          `
          SELECT
            o.id,
            o.reference,
            o.total,
            o.status,
            o.rejection_reason
              AS rejectionReason,
            o.created_at
              AS createdAt,
            o.expires_at
              AS expiresAt,
            u.id AS customerId,
            u.name AS customerName,
            u.email AS customerEmail
          FROM orders o
          JOIN users u
            ON u.id = o.user_id
          WHERE o.id = ?
          LIMIT 1
          `,
          [orderId]
        );

      if (orders.length === 0) {
        return res.status(404).json({
          error:
            'Order not found.',
        });
      }

      const order =
        orders[0];

      const [items] =
        await pool.query(
          `
          SELECT
            od.id AS orderDrugstoreId,
            od.drugstore_id AS drugstoreId,
            od.status AS drugstoreStatus,
            od.rejection_reason
              AS drugstoreRejectionReason,
            ds.name AS storeName,
            ds.address AS storeAddress,
            oi.id AS orderItemId,
            oi.medicine_id AS medicineId,
            oi.quantity,
            oi.price,
            m.brand_name AS medicineName,
            m.generic_name AS genericName,
            m.rx_required AS rxRequired
          FROM order_drugstores od
          JOIN order_items oi
            ON oi.order_drugstore_id =
               od.id
          JOIN drugstores ds
            ON ds.id =
               od.drugstore_id
          JOIN medicines m
            ON m.id =
               oi.medicine_id
          WHERE od.order_id = ?
          ORDER BY oi.id ASC
          `,
          [orderId]
        );

      res.json({
        id: Number(
          order.id
        ),

        reference:
          order.reference,

        customer: {
          id: Number(
            order.customerId
          ),
          name:
            order.customerName,
          email:
            order.customerEmail,
        },

        total:
          Number(
            order.total
          ),

        status:
          order.status,

        stage:
          order.status,

        rejectionReason:
          order.rejectionReason,

        placedOn:
          formatDate(
            order.createdAt
          ),

        createdAt:
          order.createdAt,

        expiresAt:
          order.expiresAt,

        items:
          items.map(
            (item) => ({
              id: Number(
                item.medicineId
              ),
              name:
                item.medicineName,
              genericName:
                item.genericName,
              quantity:
                Number(
                  item.quantity
                ),
              price:
                Number(
                  item.price
                ),
              drugstoreId:
                Number(
                  item.drugstoreId
                ),
              drugstoreName:
                item.storeName,
              drugstoreStatus:
                item.drugstoreStatus,
              rejectionReason:
                item.drugstoreRejectionReason,
              rxRequired:
                Number(
                  item.rxRequired
                ) === 1,
            })
          ),
      });
    } catch (error) {
      console.error(
        'Get admin order failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve order.',
      });
    }
  }
);

/* =========================================================
   ORDER STATUS MANAGEMENT
========================================================= */

/*
 * Admin can update the overall order status.
 *
 * Supported statuses used by the current system:
 *
 * pending
 * approved
 * rejected
 * cancelled
 * ready_for_pickup
 * completed
 * expired
 *
 * The database stores status as VARCHAR, so we
 * intentionally do not use a MySQL ENUM here.
 */

/* =========================================================
   STATUS NORMALIZATION
========================================================= */

function normalizeOrderStatus(
  status
) {
  return String(
    status || ''
  )
    .trim()
    .toLowerCase();
}

/* =========================================================
   RESTOCK ORDER ITEMS
========================================================= */

/*
 * Restores reserved stock back to inventory.
 *
 * This should only happen when an order is
 * cancelled/rejected/expired AFTER stock was
 * already reserved.
 *
 * The function uses a transaction connection
 * supplied by the caller.
 */
async function restockOrderItems(
  connection,
  orderId
) {
  const [items] =
    await connection.query(
      `
      SELECT
        od.drugstore_id AS drugstoreId,
        oi.medicine_id AS medicineId,
        oi.quantity
      FROM order_drugstores od
      JOIN order_items oi
        ON oi.order_drugstore_id =
           od.id
      WHERE od.order_id = ?
      `,
      [orderId]
    );

  for (const item of items) {
    await connection.query(
      `
      UPDATE inventory
      SET
        stock_count =
          stock_count + ?
      WHERE drugstore_id = ?
        AND medicine_id = ?
      `,
      [
        Number(
          item.quantity
        ),
        Number(
          item.drugstoreId
        ),
        Number(
          item.medicineId
        ),
      ]
    );
  }
}

/* =========================================================
   CHECK WHETHER ORDER WAS ALREADY CANCELLED
========================================================= */

function isCancelledStatus(
  status
) {
  const normalized =
    normalizeOrderStatus(
      status
    );

  return [
    'cancelled',
    'canceled',
    'rejected',
    'expired',
  ].includes(
    normalized
  );
}

/* =========================================================
   ADMIN — UPDATE ORDER STATUS
========================================================= */

app.put(
  '/api/orders/:id/status',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const orderId =
      Number(req.params.id);

    const requestedStatus =
      normalizeOrderStatus(
        req.body?.status
      );

    const rejectionReason =
      req.body?.rejectionReason ??
      req.body?.reason ??
      null;

    const allowedStatuses = [
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'canceled',
      'ready_for_pickup',
      'completed',
      'expired',
    ];

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    if (
      !allowedStatuses.includes(
        requestedStatus
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid order status.',
      });
    }

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      /*
       * Lock the order row so two status updates
       * cannot modify it simultaneously.
       */
      const [orderRows] =
        await connection.query(
          `
          SELECT
            id,
            reference,
            user_id,
            status,
            total
          FROM orders
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [orderId]
        );

      if (orderRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          error:
            'Order not found.',
        });
      }

      const order =
        orderRows[0];

      const previousStatus =
        normalizeOrderStatus(
          order.status
        );

      /*
       * Do not restock an order twice.
       */
      const wasPreviouslyCancelled =
        isCancelledStatus(
          previousStatus
        );

      const willBeCancelled =
        isCancelledStatus(
          requestedStatus
        );

      /*
       * Update the main order.
       */
      await connection.query(
        `
        UPDATE orders
        SET
          status = ?,
          rejection_reason = ?
        WHERE id = ?
        `,
        [
          requestedStatus,
          rejectionReason,
          orderId,
        ]
      );

      /*
       * Keep the corresponding
       * order_drugstores records synchronized.
       */
      await connection.query(
        `
        UPDATE order_drugstores
        SET
          status = ?,
          rejection_reason = ?
        WHERE order_id = ?
        `,
        [
          requestedStatus,
          rejectionReason,
          orderId,
        ]
      );

      /*
       * If the order changes from an active state
       * into a cancelled/rejected/expired state,
       * return its reserved stock.
       */
      if (
        willBeCancelled &&
        !wasPreviouslyCancelled
      ) {
        await restockOrderItems(
          connection,
          orderId
        );
      }

      /*
       * Update payment when an order is cancelled.
       *
       * The current system does not automatically
       * call GCash. It only updates the local payment
       * record.
       */
      if (
        willBeCancelled
      ) {
        await connection.query(
          `
          UPDATE payments
          SET
            payment_status =
              CASE
                WHEN payment_status = 'paid'
                  THEN 'refunded'
                ELSE payment_status
              END
          WHERE order_id = ?
          `,
          [orderId]
        );
      }

      /*
       * Audit log.
       */
      await connection.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_ORDER_STATUS', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Order ${order.reference} status changed from ${previousStatus} to ${requestedStatus}.`,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        id: Number(
          order.id
        ),
        reference:
          order.reference,
        previousStatus,
        status:
          requestedStatus,
        message:
          'Order status updated successfully.',
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors.
      }

      console.error(
        'Update order status failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update order status.',
      });
    } finally {
      connection.release();
    }
  }
);

/* =========================================================
   CUSTOMER — CANCEL OWN ORDER
========================================================= */

/*
 * Customers can cancel their own order before
 * it expires.
 *
 * This route is separate from the admin status
 * route so customers cannot modify arbitrary
 * order statuses.
 */
app.put(
  '/api/orders/:id/cancel',
  authenticate,
  async (req, res) => {
    const userId =
      Number(req.authUserId);

    const orderId =
      Number(req.params.id);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] =
        await connection.query(
          `
          SELECT
            id,
            reference,
            status,
            expires_at AS expiresAt
          FROM orders
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [
            orderId,
            userId,
          ]
        );

      if (rows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          error:
            'Order not found.',
        });
      }

      const order =
        rows[0];

      const currentStatus =
        normalizeOrderStatus(
          order.status
        );

      if (
        isCancelledStatus(
          currentStatus
        )
      ) {
        await connection.rollback();

        return res.status(400).json({
          error:
            'This order is already cancelled or expired.',
        });
      }

      if (
        currentStatus ===
          'completed' ||
        currentStatus ===
          'ready_for_pickup'
      ) {
        await connection.rollback();

        return res.status(400).json({
          error:
            'This order can no longer be cancelled.',
        });
      }

      if (
        order.expiresAt &&
        new Date(
          order.expiresAt
        ).getTime() <
          Date.now()
      ) {
        await connection.rollback();

        return res.status(400).json({
          error:
            'This order has already expired.',
        });
      }

      /*
       * Cancel the order.
       */
      await connection.query(
        `
        UPDATE orders
        SET
          status = 'cancelled',
          rejection_reason = ?
        WHERE id = ?
        `,
        [
          'Cancelled by customer.',
          orderId,
        ]
      );

      await connection.query(
        `
        UPDATE order_drugstores
        SET
          status = 'cancelled',
          rejection_reason = ?
        WHERE order_id = ?
        `,
        [
          'Cancelled by customer.',
          orderId,
        ]
      );

      /*
       * Return reserved stock.
       */
      await restockOrderItems(
        connection,
        orderId
      );

      /*
       * If the payment was already paid,
       * mark it refunded locally.
       *
       * Actual GCash refund processing will
       * require the GCash API integration.
       */
      await connection.query(
        `
        UPDATE payments
        SET
          payment_status =
            CASE
              WHEN payment_status = 'paid'
                THEN 'refunded'
              ELSE payment_status
            END
        WHERE order_id = ?
        `,
        [orderId]
      );

      await connection.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'CANCEL_ORDER', ?)
        `,
        [
          userId,
          `Customer cancelled order ${order.reference}.`,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        reference:
          order.reference,
        status:
          'cancelled',
        message:
          'Order cancelled successfully.',
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors.
      }

      console.error(
        'Customer cancellation failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to cancel order.',
      });
    } finally {
      connection.release();
    }
  }
);

/* =========================================================
   EXPIRED ORDERS
========================================================= */

/*
 * Automatically marks old unclaimed orders as expired.
 *
 * This is called during server startup and can also
 * be called periodically.
 */
async function expireOldOrders() {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Find active orders that have passed
     * their expiration time.
     */
    const [orders] =
      await connection.query(
        `
        SELECT
          id,
          reference,
          user_id,
          status
        FROM orders
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
          AND LOWER(status) NOT IN (
            'cancelled',
            'canceled',
            'rejected',
            'expired',
            'completed'
          )
        FOR UPDATE
        `
      );

    for (const order of orders) {
      /*
       * Mark order expired.
       */
      await connection.query(
        `
        UPDATE orders
        SET
          status = 'expired',
          rejection_reason = ?
        WHERE id = ?
        `,
        [
          'Order expired because it was not picked up within 3 days.',
          Number(order.id),
        ]
      );

      /*
       * Update each connected drugstore.
       */
      await connection.query(
        `
        UPDATE order_drugstores
        SET
          status = 'expired',
          rejection_reason = ?
        WHERE order_id = ?
        `,
        [
          'Order expired because it was not picked up within 3 days.',
          Number(order.id),
        ]
      );

      /*
       * Return stock.
       */
      await restockOrderItems(
        connection,
        Number(order.id)
      );

      /*
       * Payment remains non-refundable after
       * the expiration period according to the
       * current NearPill rule.
       */
      await connection.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'EXPIRE_ORDER', ?)
        `,
        [
          Number(
            order.user_id
          ),
          `Order ${order.reference} expired after the pickup period.`,
        ]
      );
    }

    await connection.commit();

    if (orders.length > 0) {
      console.log(
        `Expired ${orders.length} old order(s).`
      );
    }
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors.
    }

    console.error(
      'Expire old orders failed:',
      { code: error.code }
    );
  } finally {
    connection.release();
  }
}

/* =========================================================
   ADMIN — INVENTORY UPDATE
========================================================= */

/*
 * Current admin frontend sends:
 *
 * POST /api/inventory/update
 *
 * {
 *   pharmacyId: branchId,
 *   medId: medicineId,
 *   countDelta: number
 * }
 *
 * Example:
 *
 * countDelta = 5
 * -> add 5 stock
 *
 * countDelta = -2
 * -> remove 2 stock
 */
app.post(
  '/api/inventory/update',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const drugstoreId =
      Number(
        req.body?.pharmacyId ??
        req.body?.drugstoreId
      );

    const medicineId =
      Number(
        req.body?.medId ??
        req.body?.medicineId
      );

    const countDelta =
      Number(
        req.body?.countDelta
      );

    if (
      !Number.isInteger(
        drugstoreId
      ) ||
      drugstoreId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid pharmacy ID.',
      });
    }

    if (
      !Number.isInteger(
        medicineId
      ) ||
      medicineId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid medicine ID.',
      });
    }

    if (
      !Number.isInteger(
        countDelta
      )
    ) {
      return res.status(400).json({
        error:
          'countDelta must be an integer.',
      });
    }

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      /*
       * Make sure the inventory record exists.
       */
      const [inventoryRows] =
        await connection.query(
          `
          SELECT
            id,
            stock_count,
            availability
          FROM inventory
          WHERE drugstore_id = ?
            AND medicine_id = ?
          LIMIT 1
          FOR UPDATE
          `,
          [
            drugstoreId,
            medicineId,
          ]
        );

      if (
        inventoryRows.length === 0
      ) {
        await connection.rollback();

        return res.status(404).json({
          error:
            'Inventory record not found.',
        });
      }

      const currentStock =
        Number(
          inventoryRows[0]
            .stock_count
        );

      const newStock =
        currentStock +
        countDelta;

      if (newStock < 0) {
        await connection.rollback();

        return res.status(400).json({
          error:
            'Stock cannot be negative.',
        });
      }

      /*
       * Availability automatically becomes
       * false when stock reaches zero.
       */
      const availability =
        newStock > 0 ? 1 : 0;

      await connection.query(
        `
        UPDATE inventory
        SET
          stock_count = ?,
          availability = ?
        WHERE drugstore_id = ?
          AND medicine_id = ?
        `,
        [
          newStock,
          availability,
          drugstoreId,
          medicineId,
        ]
      );

      await connection.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_INVENTORY', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Updated inventory for drugstore ${drugstoreId}, medicine ${medicineId}: ${currentStock} -> ${newStock}.`,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        pharmacyId:
          drugstoreId,
        medicineId,
        previousStock:
          currentStock,
        stockCount:
          newStock,
        availability:
          availability === 1,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors.
      }

      console.error(
        'Update inventory failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update inventory.',
      });
    } finally {
      connection.release();
    }
  }
);

/* =========================================================
   GET ADMIN INVENTORY
========================================================= */

app.get(
  '/api/admin/inventory',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const drugstoreId =
      req.query.pharmacyId ??
      req.query.drugstoreId;

    try {
      let sql = `
        SELECT
          i.id AS inventoryId,
          i.drugstore_id AS drugstoreId,
          i.medicine_id AS medicineId,
          i.price,
          i.stock_count AS stockCount,
          i.availability,
          ds.name AS drugstoreName,
          m.brand_name AS medicineName,
          m.generic_name AS genericName,
          m.category,
          m.rx_required AS rxRequired
        FROM inventory i
        JOIN drugstores ds
          ON ds.id = i.drugstore_id
        JOIN medicines m
          ON m.id = i.medicine_id
        WHERE 1 = 1
      `;

      const params = [];

      if (
        drugstoreId !==
          undefined &&
        drugstoreId !== null &&
        String(
          drugstoreId
        ).trim() !== ''
      ) {
        const id =
          Number(
            drugstoreId
          );

        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {
          return res.status(400).json({
            error:
              'Invalid pharmacy ID.',
          });
        }

        sql += `
          AND i.drugstore_id = ?
        `;

        params.push(id);
      }

      sql += `
        ORDER BY
          ds.name ASC,
          m.brand_name ASC
      `;

      const [rows] =
        await pool.query(
          sql,
          params
        );

      res.json(rows);
    } catch (error) {
      console.error(
        'Get admin inventory failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve inventory.',
      });
    }
  }
);

/* =========================================================
   ADMIN — CREATE PHARMACY
========================================================= */

app.post(
  '/api/admin/pharmacies',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const {
      name,
      address,
      latitude,
      longitude,
      operatingHours,
      operating_hours,
      isActive,
      status,
      email,
      licenseNo,
      manager,
      rating,
      slug,
    } = req.body || {};

    const cleanName =
      String(name || '').trim();

    const cleanAddress =
      String(address || '').trim();

    const lat =
      Number(latitude);

    const lng =
      Number(longitude);

    if (!cleanName) {
      return res.status(400).json({
        error:
          'Drugstore name is required.',
      });
    }

    if (!cleanAddress) {
      return res.status(400).json({
        error:
          'Drugstore address is required.',
      });
    }

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90
    ) {
      return res.status(400).json({
        error:
          'Invalid latitude.',
      });
    }

    if (
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        error:
          'Invalid longitude.',
      });
    }

    try {
      const active =
        status === 'inactive' ||
        isActive === false
          ? 0
          : 1;

      const hours =
        operatingHours ??
        operating_hours ??
        null;

      const [result] =
        await pool.query(
          `
          INSERT INTO drugstores
            (
              name,
              address,
              latitude,
              longitude,
              operating_hours,
              is_active
            )
          VALUES
            (?, ?, ?, ?, ?, ?)
          `,
          [
            cleanName,
            cleanAddress,
            lat,
            lng,
            hours,
            active,
          ]
        );

      const drugstoreId =
        Number(
          result.insertId
        );

      /*
       * These fields are not part of the current
       * drugstores database table.
       *
       * Keep them in memory for the current
       * admin frontend contract.
       */
      storeDetailsMap.set(
        drugstoreId,
        {
          slug:
            slug || null,
          email:
            email || null,
          licenseNo:
            licenseNo || null,
          manager:
            manager || null,
          rating:
            rating ?? null,
        }
      );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'CREATE_DRUGSTORE', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Created drugstore ${cleanName}.`,
        ]
      );

      res.status(201).json({
        id: drugstoreId,
        store_id:
          drugstoreId,
        name:
          cleanName,
        address:
          cleanAddress,
        latitude:
          lat,
        longitude:
          lng,
        operatingHours:
          hours,
        status:
          active === 1
            ? 'active'
            : 'inactive',
        email:
          email || null,
        licenseNo:
          licenseNo || null,
        manager:
          manager || null,
        rating:
          rating ?? null,
        slug:
          slug || null,
      });
    } catch (error) {
      console.error(
        'Create pharmacy failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to create drugstore.',
      });
    }
  }
);

/* =========================================================
   ADMIN — UPDATE PHARMACY
========================================================= */

app.put(
  '/api/admin/pharmacies/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const drugstoreId =
      Number(req.params.id);

    if (
      !Number.isInteger(
        drugstoreId
      ) ||
      drugstoreId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid drugstore ID.',
      });
    }

    const {
      name,
      address,
      latitude,
      longitude,
      operatingHours,
      operating_hours,
      isActive,
      status,
      email,
      licenseNo,
      manager,
      rating,
      slug,
    } = req.body || {};

    try {
      const [existingRows] =
        await pool.query(
          `
          SELECT
            id,
            name,
            address,
            latitude,
            longitude,
            operating_hours,
            is_active
          FROM drugstores
          WHERE id = ?
          LIMIT 1
          `,
          [drugstoreId]
        );

      if (
        existingRows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Drugstore not found.',
        });
      }

      const existing =
        existingRows[0];

      const nextName =
        name !== undefined
          ? String(name).trim()
          : existing.name;

      const nextAddress =
        address !== undefined
          ? String(address).trim()
          : existing.address;

      const nextLatitude =
        latitude !== undefined
          ? Number(latitude)
          : Number(
              existing.latitude
            );

      const nextLongitude =
        longitude !== undefined
          ? Number(longitude)
          : Number(
              existing.longitude
            );

      const nextHours =
        operatingHours !==
          undefined
          ? operatingHours
          : operating_hours !==
              undefined
          ? operating_hours
          : existing.operating_hours;

      let nextActive =
        Number(
          existing.is_active
        );

      if (
        isActive !== undefined
      ) {
        nextActive =
          isActive ? 1 : 0;
      }

      if (
        status !== undefined
      ) {
        nextActive =
          status === 'inactive'
            ? 0
            : 1;
      }

      if (!nextName) {
        return res.status(400).json({
          error:
            'Drugstore name cannot be empty.',
        });
      }

      if (!nextAddress) {
        return res.status(400).json({
          error:
            'Drugstore address cannot be empty.',
        });
      }

      if (
        !Number.isFinite(
          nextLatitude
        ) ||
        nextLatitude < -90 ||
        nextLatitude > 90
      ) {
        return res.status(400).json({
          error:
            'Invalid latitude.',
        });
      }

      if (
        !Number.isFinite(
          nextLongitude
        ) ||
        nextLongitude < -180 ||
        nextLongitude > 180
      ) {
        return res.status(400).json({
          error:
            'Invalid longitude.',
        });
      }

      await pool.query(
        `
        UPDATE drugstores
        SET
          name = ?,
          address = ?,
          latitude = ?,
          longitude = ?,
          operating_hours = ?,
          is_active = ?
        WHERE id = ?
        `,
        [
          nextName,
          nextAddress,
          nextLatitude,
          nextLongitude,
          nextHours,
          nextActive,
          drugstoreId,
        ]
      );

      /*
       * Update non-persistent frontend details
       * only when they are provided.
       */
      const previousDetails =
        storeDetailsMap.get(
          drugstoreId
        ) || {};

      storeDetailsMap.set(
        drugstoreId,
        {
          ...previousDetails,

          ...(slug !== undefined
            ? { slug }
            : {}),

          ...(email !== undefined
            ? { email }
            : {}),

          ...(licenseNo !==
          undefined
            ? { licenseNo }
            : {}),

          ...(manager !== undefined
            ? { manager }
            : {}),

          ...(rating !== undefined
            ? { rating }
            : {}),
        }
      );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_DRUGSTORE', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Updated drugstore ${drugstoreId}.`,
        ]
      );

      const details =
        storeDetailsMap.get(
          drugstoreId
        ) || {};

      res.json({
        id:
          drugstoreId,
        store_id:
          drugstoreId,
        name:
          nextName,
        address:
          nextAddress,
        latitude:
          nextLatitude,
        longitude:
          nextLongitude,
        operatingHours:
          nextHours,
        status:
          nextActive === 1
            ? 'active'
            : 'inactive',
        email:
          details.email ||
          null,
        licenseNo:
          details.licenseNo ||
          null,
        manager:
          details.manager ||
          null,
        rating:
          details.rating ??
          null,
        slug:
          details.slug ||
          null,
      });
    } catch (error) {
      console.error(
        'Update pharmacy failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update drugstore.',
      });
    }
  }
);

/* =========================================================
   ADMIN — DELETE / DEACTIVATE PHARMACY
========================================================= */

/*
 * We deactivate rather than physically delete
 * a drugstore.
 *
 * This is safer because existing inventory,
 * subscriptions, and orders can still reference
 * the drugstore.
 */
app.delete(
  '/api/admin/pharmacies/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const drugstoreId =
      Number(req.params.id);

    if (
      !Number.isInteger(
        drugstoreId
      ) ||
      drugstoreId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid drugstore ID.',
      });
    }

    try {
      const [result] =
        await pool.query(
          `
          UPDATE drugstores
          SET
            is_active = 0
          WHERE id = ?
          `,
          [drugstoreId]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          error:
            'Drugstore not found.',
        });
      }

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'DEACTIVATE_DRUGSTORE', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Deactivated drugstore ${drugstoreId}.`,
        ]
      );

      res.json({
        success: true,
        id:
          drugstoreId,
        status:
          'inactive',
      });
    } catch (error) {
      console.error(
        'Deactivate pharmacy failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to deactivate drugstore.',
      });
    }
  }
);

/* =========================================================
   ADMIN — GET MEDICINE MASTER LIST
========================================================= */

/*
 * Admin manages the centralized medicine master list.
 *
 * Partner drugstores should NOT create new global
 * medicines. They only manage their own inventory.
 */
app.get(
  '/api/admin/medicines',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            id,
            brand_name AS brandName,
            generic_name AS genericName,
            dosage_form AS dosageForm,
            category,
            rx_required AS rxRequired,
            description,
            created_at AS createdAt
          FROM medicines
          ORDER BY
            brand_name ASC
          `
        );

      res.json(
        rows.map(
          (medicine) => ({
            ...medicine,
            rxRequired:
              Number(
                medicine.rxRequired
              ) === 1,
          })
        )
      );
    } catch (error) {
      console.error(
        'Get master medicines failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve master medicine list.',
      });
    }
  }
);

/* =========================================================
   ADMIN — CREATE MASTER MEDICINE
========================================================= */

app.post(
  '/api/admin/medicines',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const {
      brandName,
      brand_name,
      genericName,
      generic_name,
      dosageForm,
      dosage_form,
      category,
      rxRequired,
      rx_required,
      description,
    } = req.body || {};

    const brand =
      String(
        brandName ??
          brand_name ??
          ''
      ).trim();

    const generic =
      String(
        genericName ??
          generic_name ??
          ''
      ).trim() || null;

    const form =
      String(
        dosageForm ??
          dosage_form ??
          'Tablet'
      ).trim();

    const medicineCategory =
      String(
        category || ''
      ).trim() || null;

    const descriptionValue =
      String(
        description || ''
      ).trim() || null;

    const requiresPrescription =
      Boolean(
        rxRequired ??
          rx_required ??
          false
      )
        ? 1
        : 0;

    if (!brand) {
      return res.status(400).json({
        error:
          'Brand name is required.',
      });
    }

    try {
      const [result] =
        await pool.query(
          `
          INSERT INTO medicines
            (
              brand_name,
              generic_name,
              dosage_form,
              category,
              rx_required,
              description
            )
          VALUES
            (?, ?, ?, ?, ?, ?)
          `,
          [
            brand,
            generic,
            form,
            medicineCategory,
            requiresPrescription,
            descriptionValue,
          ]
        );

      const medicineId =
        Number(
          result.insertId
        );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'CREATE_MEDICINE', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Created master medicine ${brand}.`,
        ]
      );

      res.status(201).json({
        id:
          medicineId,
        brandName:
          brand,
        genericName:
          generic,
        dosageForm:
          form,
        category:
          medicineCategory,
        rxRequired:
          requiresPrescription ===
          1,
        description:
          descriptionValue,
      });
    } catch (error) {
      console.error(
        'Create master medicine failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to create medicine.',
      });
    }
  }
);

/* =========================================================
   ADMIN — UPDATE MASTER MEDICINE
========================================================= */

app.put(
  '/api/admin/medicines/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const medicineId =
      Number(req.params.id);

    if (
      !Number.isInteger(
        medicineId
      ) ||
      medicineId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid medicine ID.',
      });
    }

    const {
      brandName,
      brand_name,
      genericName,
      generic_name,
      dosageForm,
      dosage_form,
      category,
      rxRequired,
      rx_required,
      description,
    } = req.body || {};

    try {
      const [existingRows] =
        await pool.query(
          `
          SELECT
            id,
            brand_name,
            generic_name,
            dosage_form,
            category,
            rx_required,
            description
          FROM medicines
          WHERE id = ?
          LIMIT 1
          `,
          [medicineId]
        );

      if (
        existingRows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Medicine not found.',
        });
      }

      const existing =
        existingRows[0];

      const nextBrand =
        brandName !== undefined ||
        brand_name !== undefined
          ? String(
              brandName ??
                brand_name
            ).trim()
          : existing.brand_name;

      const nextGeneric =
        genericName !== undefined ||
        generic_name !== undefined
          ? String(
              genericName ??
                generic_name ??
                ''
            ).trim() || null
          : existing.generic_name;

      const nextForm =
        dosageForm !== undefined ||
        dosage_form !== undefined
          ? String(
              dosageForm ??
                dosage_form
            ).trim()
          : existing.dosage_form;

      const nextCategory =
        category !== undefined
          ? String(
              category || ''
            ).trim() || null
          : existing.category;

      const nextRx =
        rxRequired !== undefined ||
        rx_required !== undefined
          ? Boolean(
              rxRequired ??
                rx_required
            )
            ? 1
            : 0
          : Number(
              existing.rx_required
            );

      const nextDescription =
        description !== undefined
          ? String(
              description || ''
            ).trim() || null
          : existing.description;

      if (!nextBrand) {
        return res.status(400).json({
          error:
            'Brand name is required.',
        });
      }

      await pool.query(
        `
        UPDATE medicines
        SET
          brand_name = ?,
          generic_name = ?,
          dosage_form = ?,
          category = ?,
          rx_required = ?,
          description = ?
        WHERE id = ?
        `,
        [
          nextBrand,
          nextGeneric,
          nextForm,
          nextCategory,
          nextRx,
          nextDescription,
          medicineId,
        ]
      );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_MEDICINE', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Updated master medicine ${medicineId}.`,
        ]
      );

      res.json({
        id:
          medicineId,
        brandName:
          nextBrand,
        genericName:
          nextGeneric,
        dosageForm:
          nextForm,
        category:
          nextCategory,
        rxRequired:
          nextRx === 1,
        description:
          nextDescription,
      });
    } catch (error) {
      console.error(
        'Update master medicine failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update medicine.',
      });
    }
  }
);

/* =========================================================
   PARTNER DRUGSTORE — DASHBOARD
========================================================= */

app.get(
  '/api/partner/dashboard',
  authenticate,
  async (req, res) => {
    try {
      const user =
        await getAuthenticatedUser(
          req.authUserId
        );

      if (!user) {
        return res.status(401).json({
          error:
            'User not found.',
        });
      }

      if (
        user.role !== 'partner'
      ) {
        return res.status(403).json({
          error:
            'Partner access required.',
        });
      }

      /*
       * The current users table does not contain
       * a drugstore_id column.
       *
       * Therefore, the partner account-to-drugstore
       * relationship cannot currently be resolved
       * from the database alone.
       */
      return res.json({
        totalSales: 0,
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        expiredOrders: 0,
        cancelledOrders: 0,
        message:
          'Partner dashboard requires a partner-to-drugstore account mapping.',
      });
    } catch (error) {
      console.error(
        'Partner dashboard failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to load partner dashboard.',
      });
    }
  }
);

/* =========================================================
   PARTNER DRUGSTORE — SUBSCRIPTION
========================================================= */

app.get(
  '/api/partner/subscription',
  authenticate,
  async (req, res) => {
    try {
      const user =
        await getAuthenticatedUser(
          req.authUserId
        );

      if (!user) {
        return res.status(401).json({
          error:
            'User not found.',
        });
      }

      if (
        user.role !== 'partner'
      ) {
        return res.status(403).json({
          error:
            'Partner access required.',
        });
      }

      /*
       * No users.drugstore_id currently exists,
       * so there is no safe way to determine which
       * drugstore belongs to this partner account.
       */
      return res.json({
        subscription: null,
        message:
          'Partner-to-drugstore mapping is not configured.',
      });
    } catch (error) {
      console.error(
        'Partner subscription failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve subscription.',
      });
    }
  }
);

/* =========================================================
   ADMIN — SUBSCRIPTIONS
========================================================= */

app.get(
  '/api/admin/subscriptions',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            s.id,
            s.drugstore_id AS drugstoreId,
            d.name AS drugstoreName,
            s.tier,
            s.status,
            s.start_date AS startDate,
            s.end_date AS endDate
          FROM subscriptions s
          INNER JOIN drugstores d
            ON d.id = s.drugstore_id
          ORDER BY
            s.start_date DESC,
            s.id DESC
          `
        );

      res.json(rows);
    } catch (error) {
      console.error(
        'Get subscriptions failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve subscriptions.',
      });
    }
  }
);

/* =========================================================
   ADMIN — CREATE / UPDATE SUBSCRIPTION
========================================================= */

app.post(
  '/api/admin/subscriptions',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const {
      drugstoreId,
      tier,
      status,
      startDate,
      endDate,
    } = req.body || {};

    const storeId =
      Number(drugstoreId);

    const validTiers = [
      'Basic',
      'Premium',
    ];

    const validStatuses = [
      'active',
      'expired',
      'cancelled',
    ];

    if (
      !Number.isInteger(storeId) ||
      storeId <= 0
    ) {
      return res.status(400).json({
        error:
          'Valid drugstoreId is required.',
      });
    }

    if (
      !validTiers.includes(tier)
    ) {
      return res.status(400).json({
        error:
          'Tier must be Basic or Premium.',
      });
    }

    const subscriptionStatus =
      status || 'active';

    if (
      !validStatuses.includes(
        subscriptionStatus
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid subscription status.',
      });
    }

    if (!startDate) {
      return res.status(400).json({
        error:
          'startDate is required.',
      });
    }

    try {
      const [storeRows] =
        await pool.query(
          `
          SELECT id
          FROM drugstores
          WHERE id = ?
          LIMIT 1
          `,
          [storeId]
        );

      if (
        storeRows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Drugstore not found.',
        });
      }

      /*
       * Keep only one active subscription
       * for the drugstore.
       */
      if (
        subscriptionStatus ===
        'active'
      ) {
        await pool.query(
          `
          UPDATE subscriptions
          SET status = 'expired'
          WHERE
            drugstore_id = ?
            AND status = 'active'
          `,
          [storeId]
        );
      }

      const [result] =
        await pool.query(
          `
          INSERT INTO subscriptions
            (
              drugstore_id,
              tier,
              status,
              start_date,
              end_date
            )
          VALUES
            (?, ?, ?, ?, ?)
          `,
          [
            storeId,
            tier,
            subscriptionStatus,
            startDate,
            endDate || null,
          ]
        );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'CREATE_SUBSCRIPTION', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Created ${tier} subscription for drugstore ${storeId}.`,
        ]
      );

      res.status(201).json({
        id:
          Number(
            result.insertId
          ),
        drugstoreId:
          storeId,
        tier,
        status:
          subscriptionStatus,
        startDate,
        endDate:
          endDate || null,
      });
    } catch (error) {
      console.error(
        'Create subscription failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to create subscription.',
      });
    }
  }
);

/* =========================================================
   ADMIN — UPDATE SUBSCRIPTION STATUS
========================================================= */

app.put(
  '/api/admin/subscriptions/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const subscriptionId =
      Number(req.params.id);

    const {
      tier,
      status,
      endDate,
    } = req.body || {};

    if (
      !Number.isInteger(
        subscriptionId
      ) ||
      subscriptionId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid subscription ID.',
      });
    }

    const validTiers = [
      'Basic',
      'Premium',
    ];

    const validStatuses = [
      'active',
      'expired',
      'cancelled',
    ];

    if (
      tier !== undefined &&
      !validTiers.includes(tier)
    ) {
      return res.status(400).json({
        error:
          'Invalid subscription tier.',
      });
    }

    if (
      status !== undefined &&
      !validStatuses.includes(status)
    ) {
      return res.status(400).json({
        error:
          'Invalid subscription status.',
      });
    }

    try {
      const [existingRows] =
        await pool.query(
          `
          SELECT
            id,
            drugstore_id,
            tier,
            status,
            start_date,
            end_date
          FROM subscriptions
          WHERE id = ?
          LIMIT 1
          `,
          [subscriptionId]
        );

      if (
        existingRows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Subscription not found.',
        });
      }

      const existing =
        existingRows[0];

      const nextTier =
        tier ??
        existing.tier;

      const nextStatus =
        status ??
        existing.status;

      const nextEndDate =
        endDate !== undefined
          ? endDate
          : existing.end_date;

      await pool.query(
        `
        UPDATE subscriptions
        SET
          tier = ?,
          status = ?,
          end_date = ?
        WHERE id = ?
        `,
        [
          nextTier,
          nextStatus,
          nextEndDate || null,
          subscriptionId,
        ]
      );

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_SUBSCRIPTION', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Updated subscription ${subscriptionId}.`,
        ]
      );

      res.json({
        id:
          subscriptionId,
        drugstoreId:
          Number(
            existing.drugstore_id
          ),
        tier:
          nextTier,
        status:
          nextStatus,
        startDate:
          existing.start_date,
        endDate:
          nextEndDate || null,
      });
    } catch (error) {
      console.error(
        'Update subscription failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update subscription.',
      });
    }
  }
);

/* =========================================================
   ADMIN — SALES REPORT
========================================================= */

app.get(
  '/api/admin/reports/sales',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const {
      startDate,
      endDate,
    } = req.query || {};

    try {
      const conditions = [];
      const params = [];

      if (startDate) {
        conditions.push(
          'o.created_at >= ?'
        );

        params.push(
          `${startDate} 00:00:00`
        );
      }

      if (endDate) {
        conditions.push(
          'o.created_at <= ?'
        );

        params.push(
          `${endDate} 23:59:59`
        );
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(
              ' AND '
            )}`
          : '';

      const [rows] =
        await pool.query(
          `
          SELECT
            DATE(o.created_at) AS reportDate,
            COUNT(*) AS orderCount,
            COALESCE(
              SUM(o.total),
              0
            ) AS revenue
          FROM orders o
          ${whereClause}
          GROUP BY
            DATE(o.created_at)
          ORDER BY
            reportDate ASC
          `,
          params
        );

      res.json(
        rows.map(
          (row) => ({
            reportDate:
              row.reportDate,
            orderCount:
              Number(
                row.orderCount
              ),
            revenue:
              Number(
                row.revenue
              ),
          })
        )
      );
    } catch (error) {
      console.error(
        'Sales report failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to generate sales report.',
      });
    }
  }
);

/* =========================================================
   ADMIN — MOST ORDERED MEDICINES
========================================================= */

app.get(
  '/api/admin/reports/medicines',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            m.id AS medicineId,
            m.brand_name AS brandName,
            m.generic_name AS genericName,
            SUM(oi.quantity) AS quantitySold,
            COUNT(
              DISTINCT od.order_id
            ) AS orderCount
          FROM order_items oi
          INNER JOIN medicines m
            ON m.id = oi.medicine_id
          INNER JOIN order_drugstores od
            ON od.id =
              oi.order_drugstore_id
          INNER JOIN orders o
            ON o.id =
              od.order_id
          WHERE
            o.status NOT IN (
              'cancelled',
              'rejected',
              'expired'
            )
          GROUP BY
            m.id,
            m.brand_name,
            m.generic_name
          ORDER BY
            quantitySold DESC
          `
        );

      res.json(
        rows.map(
          (row) => ({
            medicineId:
              Number(
                row.medicineId
              ),
            brandName:
              row.brandName,
            genericName:
              row.genericName,
            quantitySold:
              Number(
                row.quantitySold
              ),
            orderCount:
              Number(
                row.orderCount
              ),
          })
        )
      );
    } catch (error) {
      console.error(
        'Medicine report failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to generate medicine report.',
      });
    }
  }
);

/* =========================================================
   ADMIN — PARTNER PERFORMANCE
========================================================= */

app.get(
  '/api/admin/reports/drugstores',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            d.id AS drugstoreId,
            d.name AS drugstoreName,

            COUNT(
              DISTINCT od.order_id
            ) AS orderCount,

            COALESCE(
              SUM(
                CASE
                  WHEN o.status NOT IN (
                    'cancelled',
                    'rejected',
                    'expired'
                  )
                  THEN oi.price *
                       oi.quantity
                  ELSE 0
                END
              ),
              0
            ) AS revenue,

            SUM(
              CASE
                WHEN o.status IN (
                  'cancelled',
                  'rejected'
                )
                  THEN 1
                ELSE 0
              END
            ) AS cancelledCount,

            SUM(
              CASE
                WHEN o.status = 'expired'
                  THEN 1
                ELSE 0
              END
            ) AS expiredCount

          FROM drugstores d

          LEFT JOIN order_drugstores od
            ON od.drugstore_id = d.id

          LEFT JOIN orders o
            ON o.id = od.order_id

          LEFT JOIN order_items oi
            ON oi.order_drugstore_id =
              od.id

          GROUP BY
            d.id,
            d.name

          ORDER BY
            revenue DESC
          `
        );

      res.json(
        rows.map(
          (row) => ({
            drugstoreId:
              Number(
                row.drugstoreId
              ),
            drugstoreName:
              row.drugstoreName,
            orderCount:
              Number(
                row.orderCount
              ),
            revenue:
              Number(
                row.revenue
              ),
            cancelledCount:
              Number(
                row.cancelledCount ||
                  0
              ),
            expiredCount:
              Number(
                row.expiredCount ||
                  0
              ),
          })
        )
      );
    } catch (error) {
      console.error(
        'Drugstore report failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to generate drugstore report.',
      });
    }
  }
);

/* =========================================================
   ADMIN — AUDIT LOGS
========================================================= */

app.get(
  '/api/admin/audit-logs',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            a.id,
            a.user_id AS userId,
            u.name AS userName,
            u.email AS userEmail,
            u.role AS userRole,
            a.action,
            a.description,
            a.created_at AS createdAt
          FROM audit_logs a
          LEFT JOIN users u
            ON u.id = a.user_id
          ORDER BY
            a.created_at DESC,
            a.id DESC
          LIMIT 500
          `
        );

      res.json(rows);
    } catch (error) {
      console.error(
        'Audit log retrieval failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve audit logs.',
      });
    }
  }
);

/* =========================================================
   PAYMENT — GET ORDER PAYMENT
========================================================= */

app.get(
  '/api/orders/:id/payment',
  authenticate,
  async (req, res) => {
    const orderId =
      Number(req.params.id);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            p.id,
            p.order_id AS orderId,
            p.amount,
            p.payment_method AS paymentMethod,
            p.payment_status AS paymentStatus,
            p.payment_reference AS paymentReference,
            p.created_at AS createdAt
          FROM payments p
          INNER JOIN orders o
            ON o.id = p.order_id
          WHERE
            p.order_id = ?
            AND (
              o.user_id = ?
              OR EXISTS (
                SELECT 1
                FROM users u
                WHERE
                  u.id = ?
                  AND u.role = 'admin'
              )
            )
          ORDER BY
            p.id DESC
          LIMIT 1
          `,
          [
            orderId,
            Number(
              req.authUserId
            ),
            Number(
              req.authUserId
            ),
          ]
        );

      if (rows.length === 0) {
        return res.json({
          payment: null,
        });
      }

      res.json({
        payment:
          rows[0],
      });
    } catch (error) {
      console.error(
        'Get payment failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve payment.',
      });
    }
  }
);

/* =========================================================
   ADMIN — UPDATE PAYMENT
========================================================= */

app.put(
  '/api/admin/orders/:id/payment',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const orderId =
      Number(req.params.id);

    const {
      amount,
      paymentMethod,
      paymentStatus,
      paymentReference,
    } = req.body || {};

    const validStatuses = [
      'pending',
      'paid',
      'refunded',
      'failed',
    ];

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid order ID.',
      });
    }

    if (
      paymentStatus !== undefined &&
      !validStatuses.includes(
        paymentStatus
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid payment status.',
      });
    }

    try {
      const [orderRows] =
        await pool.query(
          `
          SELECT
            id,
            total
          FROM orders
          WHERE id = ?
          LIMIT 1
          `,
          [orderId]
        );

      if (
        orderRows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Order not found.',
        });
      }

      const order =
        orderRows[0];

      const paymentAmount =
        amount !== undefined
          ? Number(amount)
          : Number(order.total);

      if (
        !Number.isFinite(
          paymentAmount
        ) ||
        paymentAmount < 0
      ) {
        return res.status(400).json({
          error:
            'Invalid payment amount.',
        });
      }

      const [existingRows] =
        await pool.query(
          `
          SELECT
            id
          FROM payments
          WHERE order_id = ?
          ORDER BY id DESC
          LIMIT 1
          `,
          [orderId]
        );

      if (
        existingRows.length > 0
      ) {
        await pool.query(
          `
          UPDATE payments
          SET
            amount = ?,
            payment_method = ?,
            payment_status = ?,
            payment_reference = ?
          WHERE id = ?
          `,
          [
            paymentAmount,
            paymentMethod ||
              'GCash',
            paymentStatus ||
              'pending',
            paymentReference ||
              null,
            existingRows[0].id,
          ]
        );
      } else {
        await pool.query(
          `
          INSERT INTO payments
            (
              order_id,
              amount,
              payment_method,
              payment_status,
              payment_reference
            )
          VALUES
            (?, ?, ?, ?, ?)
          `,
          [
            orderId,
            paymentAmount,
            paymentMethod ||
              'GCash',
            paymentStatus ||
              'pending',
            paymentReference ||
              null,
          ]
        );
      }

      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            action,
            description
          )
        VALUES
          (?, 'UPDATE_PAYMENT', ?)
        `,
        [
          Number(
            req.authUserId
          ),
          `Updated payment for order ${orderId}.`,
        ]
      );

      const [paymentRows] =
        await pool.query(
          `
          SELECT
            id,
            order_id AS orderId,
            amount,
            payment_method AS paymentMethod,
            payment_status AS paymentStatus,
            payment_reference AS paymentReference,
            created_at AS createdAt
          FROM payments
          WHERE order_id = ?
          ORDER BY id DESC
          LIMIT 1
          `,
          [orderId]
        );

      res.json({
        payment:
          paymentRows[0],
      });
    } catch (error) {
      console.error(
        'Update payment failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to update payment.',
      });
    }
  }
);

/* =========================================================
   CUSTOMER — PAYMENT STATUS
========================================================= */

app.get(
  '/api/payments/:id',
  authenticate,
  async (req, res) => {
    const paymentId =
      Number(req.params.id);

    if (
      !Number.isInteger(
        paymentId
      ) ||
      paymentId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid payment ID.',
      });
    }

    try {
      const [rows] =
        await pool.query(
          `
          SELECT
            p.id,
            p.order_id AS orderId,
            p.amount,
            p.payment_method AS paymentMethod,
            p.payment_status AS paymentStatus,
            p.payment_reference AS paymentReference,
            p.created_at AS createdAt,
            o.reference
          FROM payments p
          INNER JOIN orders o
            ON o.id = p.order_id
          WHERE
            p.id = ?
            AND (
              o.user_id = ?
              OR EXISTS (
                SELECT 1
                FROM users u
                WHERE
                  u.id = ?
                  AND u.role = 'admin'
              )
            )
          LIMIT 1
          `,
          [
            paymentId,
            Number(
              req.authUserId
            ),
            Number(
              req.authUserId
            ),
          ]
        );

      if (
        rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Payment not found.',
        });
      }

      res.json(
        rows[0]
      );
    } catch (error) {
      console.error(
        'Payment lookup failed:',
        { code: error.code }
      );

      res.status(500).json({
        error:
          'Unable to retrieve payment.',
      });
    }
  }
);

/* =========================================================
   GLOBAL 404 HANDLER
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        'Endpoint not found.',
      path:
        req.originalUrl,
    });
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      'Unhandled server error:',
      { code: error.code }
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(
      error.status || 500
    ).json({
      error:
        error.message ||
        'Internal server error.',
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    console.log(
      'Checking database connection...'
    );

    await verifyDatabase();

    console.log(
      'Database verification completed.'
    );

    /*
     * Expire old orders immediately when the
     * backend starts.
     */
    await expireOldOrders();

    /*
     * Check expired orders every hour.
     */
    setInterval(
      () => {
        expireOldOrders().catch(
          (error) => {
            console.error(
              'Scheduled order expiration failed:',
              { code: error.code }
            );
          }
        );
      },
      60 * 60 * 1000
    );

    const server =
      app.listen(
        Number(PORT),
        '0.0.0.0',
        () => {
          console.log(
            `NearPill backend listening on http://localhost:${PORT}`
          );

          console.log(
            `Database: ${DB_NAME}`
          );
        }
      );

    /*
     * Graceful shutdown.
     */
    const shutdown =
      async (
        signal
      ) => {
        console.log(
          `${signal} received. Shutting down server...`
        );

        server.close(
          async () => {
            try {
              loginSecurity.close();
              recoverySecurity.close();
              recovery.close();
              await pool.end();

              console.log(
                'Database connection pool closed.'
              );

              process.exit(
                0
              );
            } catch (
              error
            ) {
              console.error(
                'Shutdown error:',
                { code: error.code }
              );

              process.exit(
                1
              );
            }
          }
        );
      };

    process.once(
      'SIGINT',
      () =>
        shutdown(
          'SIGINT'
        )
    );

    process.once(
      'SIGTERM',
      () =>
        shutdown(
          'SIGTERM'
        )
    );
  } catch (error) {
    console.error(
      'Failed to start NearPill backend:',
      { code: error.code }
    );

    try {
      await pool.end();
    } catch (_) {
      // Ignore pool-close errors.
    }

    process.exit(1);
  }
}

startServer();
