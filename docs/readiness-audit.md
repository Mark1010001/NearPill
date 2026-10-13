# NearPill readiness audit

Reviewed 13 October 2026. This is a source audit with targeted automated checks, not a declaration of legal compliance, clinical safety or production readiness. The team plans real payments later. No real wallet transaction, customer data deletion or database migration was performed.

## Scope and completed changes

The change reaches web API display mapping, dynamic navigation/dialogs, login markup, shared CSS, Flutter authentication, onboarding, store inventory, payment and confirmation screens, profile links, bundled policy assets and focused tests. Existing API contracts, database schemas and account records are preserved. There are no new dependencies or schema migrations. The pre-existing modified dependency cache is excluded from this work.

| Screenshot item | Result / evidence |
| --- | --- |
| Privacy policy | Shared prelaunch notice in [policies.json](../web/policies.json), available through [policies.html](../web/policies.html) and the mobile policy screen. Describes actual collection, recipients, storage, rights contact and retention gaps. |
| Refund policy / terms | Shared cancellation and prelaunch terms sections. Removed unconditional non-refundability and the unsupported 3–5 day refund promise. Clearly states there is no integrated charge/refund processing. Final commercial rules still require owner decisions. |
| Business details | Supplied support/privacy email added. Registered operator name, address, registrations and responsible person still required. Demo credentials do not establish those facts. |
| Only necessary data | Removed registration phone collection that never reached the server. Phone/birthdate remain in profile/checkout; justify exact birthdate or minimize it before real customer use. |
| Form consent | Added access to the notice before signup and checkout. No blanket privacy-agreement checkbox added. Document legal basis by purpose and implement separate, recorded consent wherever required; future health uploads/dependent prescriptions must not launch without it. |
| Unsupported claims / fake reviews | Removed invented missing licences/manufacturers and mobile ratings/distances, false profile verification and unimplemented biometrics. Replaced sample stock fallback with actual backend inventory and honest empty/error states. Browser branch examples remain visibly sample data. No live customer review system was found. |
| Contrast | Darkened shared web primary/muted text and Flutter green controls. Tests check white text against primary colors. Secondary colors, charts, disabled states and every background combination need runtime assessment. |
| Keyboard / labels | Native web navigation buttons and password toggle; linked form labels; skip link; focus indicator; inactive app is inert behind login. Native dialogs provide modal focus handling and Escape dismissal. Toasts announce status. Mobile signup scrolls with larger text, OTP digits have labels, and time slots use keyboard-capable InkWell. |
| Image alternatives / copyright | Onboarding illustrations excluded from semantics because adjacent text communicates their meaning. Decorative icons and charts still need a complete assistive-technology review; charts need equivalent textual data. Ownership/licence evidence for existing PNGs and branding is not present in the repo. |
| Third parties / tracking / cookie policy | Inventoried Google Fonts, cdnjs, jsDelivr and configured Resend. Cookie/storage section describes first-party source behavior. Map screen is a placeholder; an installed maps dependency does not demonstrate live location collection. No optional ad tracker found; no speculative cookie banner added. Reassess deployed network traffic and future SDKs. |
| Local laws | Official NPC, DTI and FDA sources reviewed below. Pharmacy/medicine approvals and applicability to the actual operator/business model need verification. This audit cannot authenticate missing licences. |

## Confirmed blockers before live customer data or real payments

1. **Account security:** `backend/server.js` stores and compares plain-text passwords. Login/signup/email verification now validate input types, formats and lengths on the server, with generic errors and validation logs that omit submitted values. Migrate existing accounts safely to password hashing; strengthen the existing six-character signup minimum, validate profile data and enforce verified-email requirements. `backend/auth.js` creates tokens using timestamp/Math.random, gives access and refresh tokens the same privileges, and has no timed expiry. Replace with cryptographically secure tokens, distinct refresh behavior and expiry/revocation. Mobile refresh currently fails to save the rotated refresh token. Review logging so credentials and health/order data are not exposed.
2. **Portal authorization:** `web/js/app.js` accepts demo identities without checking passwords and persists editable client roles. `web/js/api.js` does not send backend bearer tokens. Backend admin routes already require authentication and roles. Replace the demo portal access with real server authentication and branch authorization before granting staff access. API mutation errors are currently swallowed, so success toasts can be misleading. Review dynamic HTML rendering for stored/script injection before accepting real pharmacy/customer content.
3. **Payments and refunds:** implement a provider checkout, authenticated and idempotent payment webhooks, verified transaction references, accurate full/deposit amounts and confirmed provider refunds. A local `refunded` enum value must not be presented as money returned. Reconcile all admin/customer/scheduled expiry paths with the approved refund matrix below. Do not charge a customer before publishing those rules.
4. **Data handling:** approve purpose and lawful basis per field, account/health data access boundaries, retention and backup deletion schedules, identity-checked rights handling, breach response and production providers/locations. Make the cart account-specific or clear it on logout so the next person using the device cannot inherit medicine selections. Determine age/dependent support and authority for health information before adding uploads.
5. **Pharmacy and product evidence:** obtain each actual pharmacy's legal name/address, responsible pharmacist, current licence and relevant online-selling permissions. Verify real product registration and only show substantiated claims. Keep a dated record of the source, licence/registration number, expiry and reviewer. The current fixtures are not evidence. Establish pharmacist prescription review and dispensing responsibility.

These findings are recorded for remediation; the backend authentication/payment redesign is outside this inventory and interface correction. Existing authentication was not replaced with another incomplete scheme.

## Refund decisions to supply before integration

| Event | Current backend behavior | Required business decision |
| --- | --- | --- |
| Customer cancels before ready/completed and before expiry | Cancel, restock; local paid records may become refunded | Refund eligibility, fees if lawful, method, time and provider confirmation |
| Pharmacy rejects / admin cancels | Status-driven restock/payment-record updates | Full/partial refund responsibility and notification |
| Three-day missed pickup expiry | Expire and restock; scheduled routine does not refund | Retention of funds, exceptions and consumer-rights review |
| Partial fulfilment / multi-pharmacy order | Multiple store/item records; no provider reconciliation | Partial capture/refund amounts and pharmacy responsibilities |
| Duplicate payment, timeout or failed transaction | No provider event processing | Idempotency, pending reconciliation and reversal |
| Incorrect/defective medicine | No implemented dispute workflow | Complaint contact, evidence, pharmacy handling and legally required remedies |

The public pages use `nearpillemail@gmail.com`. The legal operator name/address, provider, approved refund rules and specific retention periods remain unanswered; no details were invented.

## Verification and remaining checks

Regression checks cover service information, the web portal and auth validation. Run `flutter test --no-pub` and `node --test backend/test/auth-validation.test.mjs test/web_service_information.test.cjs`. The auth middleware test uses a local HTTP server without database or email calls. JavaScript syntax and Git whitespace checks are also applicable.

Completed in this workspace: 12 Flutter tests passed, 6 Node tests passed, edited JavaScript passed syntax checks, and Git whitespace checks passed. The data inventory and policy text were checked against the inspected source; no live transaction or production data was used.

No browser was available through the connected computer-use tool during this audit. Keyboard Tab/Shift+Tab/Enter/Space/Escape, focus restoration, screen-reader announcements, chart alternatives, 200% zoom, mobile small screens and actual network cookies need runtime verification. Flutter large-text checks cover the edited signup flow; they do not certify the whole app. No production site, MySQL flow, actual licence or image ownership was verified.

## Official references

- [NPC: right to be informed](https://privacy.gov.ph/the-right-to-be-informed/) — notice contents, recipients, controller contact and retention information.
- [Data Privacy Act](https://privacy.gov.ph/data-privacy-act-/) — processing principles, sensitive information and lawful processing conditions.
- [NPC consent guidelines, Circular 2023-04](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf) — evaluate purpose-specific consent instead of treating a privacy notice as blanket permission.
- [DTI: Internet Transactions Act implementing rules, JAO 24-03](https://ecommerce.dti.gov.ph/wp-content/uploads/2024/06/Joint-Administrative-Order-No.-24-03.pdf) — review consumer remedies and online transaction responsibilities when setting live terms.
- [FDA: e-pharmacy licensing guidance document](https://www.fda.gov.ph/wp-content/uploads/2022/02/Guidelines-on-the-Issuance-of-License-to-Operate.pdf) — confirm the applicable final issuance and licence scope directly with FDA before relying on it; this document alone does not prove authorization for NearPill or a partner.
- [W3C: WCAG 2.2 guidance](https://www.w3.org/WAI/WCAG22/Understanding/) — contrast, labels, keyboard operation and focus review criteria.
