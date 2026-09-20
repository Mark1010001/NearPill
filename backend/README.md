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

### Test the API

```bash
Invoke-RestMethod -Uri http://localhost:3000/api/medicines -UseBasicParsing
```
