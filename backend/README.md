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
the backend returns the OTP to the app for local development. To test Resend
delivery without a domain, set `DEV_OTP_INBOX` in local `.env` to the Gmail
address on your Resend account. In non-production runs, signup codes for any
entered address go to that test inbox. This tests the signup flow but does not
verify ownership of the entered address. Remove `DEV_OTP_INBOX` when testing
real email ownership; production ignores it. The
current implementation keeps verification in memory; add `emailVerified` to
the database later when the capstone flow is finalized.

### Run the backend

Use Node.js 24.7 or newer; password hashing uses its built-in Argon2id API.

```bash
cd backend
npm install
npm run dev
```

### Authentication input validation

Login, registration, send-code, verify-code and password-recovery requests are validated by
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
middleware over HTTP with no database or email calls. Verified-email enforcement,
password-policy strength and further session hardening remain launch requirements
in [the readiness audit](../docs/readiness-audit.md).

### Login limits and password recovery

`login-security.js` allows at most 10 login POSTs from one IP in a rolling minute,
including malformed requests. Failed credential checks are tracked by normalized
email across IPs. Before another credential check, failure 1 requires a 1-second
wait, failure 2 requires 2 seconds, failure 3 requires 4 seconds and failure 4
requires 8 seconds. Failure 5 blocks sign-in for 15 minutes. A successful sign-in
or password reset clears the failures; counters also expire after 15 minutes idle.
Requests during a cooldown/lockout are rejected without another password check or
extending the lock. Only one credential check runs for an account at a time.

Wrong credentials, unknown accounts, IP limits, cooldowns and lockouts all return
the same HTTP 401 and error message, without a lockout reason or Retry-After header.
Unknown emails receive the same account-counter behavior. Email notifications are
sent only for actual accounts, asynchronously after the fifth failure.

The Flutter **Forgot Password?** button now requests a reset link. Recovery routes:

| Route | JSON body / result |
| --- | --- |
| `POST /api/auth/forgot-password` | `{ "email": "..." }`; same neutral confirmation for known and unknown accounts |
| `POST /api/auth/reset-password` | `{ "token": "64 hexadecimal characters", "password": "..." }`; updates the password after validating a single-use token |
| `GET /reset-password#token=...` | Browser form served by the backend; token stays out of server URLs and referrers |

Both recovery POST routes share a separate 10-per-IP-per-minute budget. Reset links
expire in 15 minutes and are stored as hashes in memory. Repeated manual requests
within that interval do not resend mail. A lockout replaces any pending unused
link with a fresh notification. Successful reset revokes that account's access and
refresh tokens, invalidates in-flight logins and clears its lockout. No automatic
sign-in follows a reset. Failed database writes leave the link retryable until expiry.

Configure these in the local backend `.env` to send real emails:

```text
RESEND_API_KEY=your_resend_key
MAIL_FROM=NearPill <security@your-verified-domain.com>
PUBLIC_APP_URL=http://localhost:3001
```

Match `PUBLIC_APP_URL` to your backend's port and host. Without it, development
defaults to `http://localhost:<PORT>`. A production URL must use HTTPS, and the
mobile `API_BASE_URL` must also use HTTPS when deployed. Reset links always use this
configured URL, never the request's Host or forwarded headers. Missing email
configuration or delivery failures are logged without email addresses or tokens;
no reset link is printed to the console. This local project has not sent a real
security email during automated testing.

State is bounded to 10,000 entries per in-memory map, purged periodically and lost
on restart. Run one server process while using this implementation. Use shared
storage and atomic account checks before deploying multiple instances. Behind a
reverse proxy, configure Express `trust proxy` for the actual trusted proxy addresses;
the default deliberately ignores spoofable forwarding headers. Clients otherwise
share the proxy's IP budget. Treat a full cache as an authentication denial, not an
unlimited bypass.

### Password storage and migration

Signup and password reset use Argon2id with a random 16-byte salt, 19 MiB memory,
two passes, one lane and a 32-byte key. The encoded hash records the parameters.
This meets the [OWASP minimum](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
without adding a dependency. Verification uses `timingSafeEqual`, preserving the
password exactly, including spaces and special characters.

The [login handler](login-handler.js) upgrades plaintext, the previous
`scrypt$16384$8$5$...` format, and explicitly tagged `md5$<hex>` / `sha1$<hex>`
records after successful verification. Wrong passwords never trigger a migration.
A conditional update prevents overwriting a concurrent password reset. Verification
runs both KDFs during the transition so unknown accounts and legacy records also
incur the hashing cost. Remove the old KDF work once legacy records are retired.

Bare 32/40/64-character hexadecimal values cannot safely be distinguished from
literal passwords. Those accounts, corrupted hashes and unsupported formats require
password recovery; do not guess a format or accept a stored digest as a password.
No MD5/SHA-1 password writer was found. The existing `VARCHAR(255)` column fits the
new hashes; no schema change or offline rehash script is needed. Dormant legacy
records still need sign-in migration or reset before live use.

Run the read-only inventory from the repository root:

```bash
node backend/audit-passwords.js
```

It loads `backend/.env`, scans in batches and prints only format counts, never
passwords, hashes or account identifiers. The local audit on 13 October 2026 found
five plaintext records and no other formats; it did not modify accounts. Re-run it
after sign-in/reset migration. Backend errors log event names and error codes;
mobile HTTP logs omit request/response contents, URLs and exception messages;
web console logs omit raw errors and event payloads.

Session tokens use cryptographically random bytes. Timed session expiry and
separation of access and refresh privileges still need work.

From the repository root, run:

```bash
node --test backend/test/auth-validation.test.mjs backend/test/login-security.test.mjs backend/test/email.test.mjs backend/test/password-migration.test.mjs test/web_service_information.test.cjs
flutter test --no-pub
```

The backend tests use a local HTTP server, fake clock, fake database and mock email
transport. They do not modify MySQL or send real email.

### Medicine API smoke check

```bash
Invoke-RestMethod -Uri http://localhost:3000/api/medicines -UseBasicParsing
```
