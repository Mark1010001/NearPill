# NearPill Backend Setup

This backend is intended to run as a local or deployed API server for the NearPill Flutter app.

## Recommended MySQL user

For a production-ready APK distribution, do not use the MySQL `root` account for the app.
Use a dedicated app user instead.

### Create the app database and user

Run the following in MySQL as an admin user (e.g. `root`):

```sql
CREATE DATABASE IF NOT EXISTS nearpill;

CREATE USER IF NOT EXISTS 'nearpill_app'@'localhost' IDENTIFIED BY 'your_secure_password_here';
GRANT SELECT, INSERT, UPDATE, DELETE ON nearpill.* TO 'nearpill_app'@'localhost';
FLUSH PRIVILEGES;

-- Create the orders table before starting the backend.
USE nearpill;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(64) NOT NULL UNIQUE,
  storeName VARCHAR(255) NOT NULL,
  itemSummary VARCHAR(1024) NOT NULL,
  itemCount INT NOT NULL,
  total VARCHAR(64) NOT NULL,
  placedOn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stage VARCHAR(32) NOT NULL DEFAULT 'placed',
  items TEXT
);
```

### Use the app user in the backend

Copy `.env.example` to `.env` and update the credentials:

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nearpill_app
DB_PASSWORD=your_secure_password_here
DB_NAME=nearpill
PORT=3000

# Optional: real verification email delivery through Resend
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM=NearPill <onboarding@your-verified-domain.com>
```

### Email verification

Sign-up sends a six-digit code through Resend and verifies it before account
creation. Codes expire after 10 minutes. Without the Resend settings above,
the backend prints the OTP to the Node console for local development. The
current implementation keeps verification in memory; add `emailVerified` to
the database later when the capstone flow is finalized.

### Run the backend

```bash
cd backend
npm install
npm run dev
```

### Authentication input validation

Login, registration, send-code and verify-code requests are validated by
`auth-validation.js` before the database or email handlers run. Auth JSON bodies
are limited to 4 KiB. Invalid bodies return a generic JSON error with HTTP 400
(413 for oversized bodies). Validation logs contain only the action and reason.

- Email: trimmed, lowercased ASCII dot-atom address, maximum 254 characters,
  local part up to 64 and domain labels up to 63. Quoted and internationalized
  mailbox addresses are currently unsupported; format checks do not prove ownership.
- Full name at signup: 1–100 characters after trimming; Unicode letters, marks,
  numbers, spaces, apostrophes, periods, commas, parentheses, hyphens and underscores.
  At least one letter is required. Markup and embedded control characters are rejected.
- Signup password: the current client minimum of 6 characters, maximum 128.
  Login allows 1–255 characters to preserve access for legacy accounts. Lengths
  use JavaScript/Flutter UTF-16 units. Passwords are never trimmed or rewritten.
- Verification code: exactly six ASCII digits, sent as a string.
- Missing, incorrectly typed and unexpected fields are rejected. NearPill has
  no username field; signup sends `fullName`, `email` and `password`.

Run `node --test test/auth-validation.test.mjs` from `backend` to test the
middleware over HTTP with no database or email calls. Plain-text password
storage, verified-email enforcement and session hardening remain separate launch
requirements in [the readiness audit](../docs/readiness-audit.md).

### Medicine API smoke check

```bash
Invoke-RestMethod -Uri http://localhost:3000/api/medicines -UseBasicParsing
```
