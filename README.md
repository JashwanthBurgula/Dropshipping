# Kala & Kiln - Verified-Account Dropshipping Platform

A production-grade dropshipping e-commerce platform built for the Indian market with verified customer accounts (6-digit email OTP verification), PIN-code serviceability and zone shipping, HSN/GST slab calculation (CGST/SGST/IGST), Razorpay + OTP-verified Cash on Delivery, and passwordless tokenized dealer handoff.

## Tech Stack
- **Framework:** Next.js 16 (App Router, strict TypeScript)
- **Styling:** Tailwind CSS 4 configured via `src/styles/tokens.ts` (WCAG 2.2 AA verified light and dark palettes; light theme default with explicit user theme switch)
- **Database:** PostgreSQL 16 with Prisma ORM (`full-text search` + `pg_trgm`)
- **Sessions & Rate Limiting:** Redis 7 (`ioredis` with automatic local in-memory fallback for standalone development and testing only; fails closed in production)
- **Email Delivery:** Pluggable adapter (`src/lib/email/index.ts`) supporting `smtp` (`nodemailer`), `resend`, and `console` (local dev inbox capture)
- **Validation:** Shared Zod schemas on client and server
- **Security:** Argon2id password hashing, 6-digit single-use email OTP verification (`crypto.randomInt`, HMAC-SHA256 with `TOKEN_HASH_PEPPER`), TOTP 2FA with recovery codes, AES-256-GCM encryption for COD refund payout details, hybrid static-hash and dynamic per-request nonce CSP (`src/proxy.ts`), CSRF tokens, Cloudflare Turnstile

## Local Setup Instructions

### 1. Start PostgreSQL 16 and Redis 7 via Docker
```powershell
docker compose up -d
```

### 2. Configure Environment Variables
```powershell
Copy-Item .env.example .env
```

### 3. Install Dependencies, Generate Prisma Client & Seed Data
```powershell
npm install
npm run db:generate
npm run db:seed
```
- Seeding creates:
  - **Initial Admin (`admin@kalaandkiln.in`)** using `INITIAL_ADMIN_PASSWORD` (forced to change password on first login + enroll TOTP 2FA).
  - **Verified Test Customer (`SEED_CUSTOMER_EMAIL` / `SEED_CUSTOMER_PASSWORD`)** with serviceable Bengaluru PIN code `560001`.
  - `prisma/seed.ts` refuses to run when `NODE_ENV="production"`.

### 4. Real Email Delivery Setup (Gmail SMTP with App Password or Resend)
`EMAIL_PROVIDER` accepts `"smtp"`, `"resend"`, or `"console"`. On startup, the server prints a single banner indicating which email provider is active. In production, the application refuses to start if `EMAIL_PROVIDER` is `"console"` or if placeholder credentials remain.

#### Option A: Gmail SMTP with a Google App Password (Recommended for Real Inbox Testing)
1. Enable **2-Step Verification** on your Google Account (`https://myaccount.google.com/security`).
2. Visit **App Passwords** (`https://myaccount.google.com/apppasswords`), create an app password named `Kala & Kiln Local`, and copy the 16-character password.
3. Set the following in `.env`:
   ```env
   EMAIL_PROVIDER="smtp"
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_SECURE="false"
   SMTP_USER="your.address@gmail.com"
   SMTP_PASS="abcd efgh ijkl mnop"
   EMAIL_FROM="Kala & Kiln <your.address@gmail.com>"
   ```
4. Verify live email delivery from the terminal:
   ```powershell
   npm run email:test -- recipient@example.com
   ```

#### Option B: Resend (Production Transactional Email)
```env
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_your_live_resend_api_key"
EMAIL_FROM="Kala & Kiln <orders@yourdomain.in>"
```

#### Option C: Local Development Console & Inbox (`EMAIL_PROVIDER="console"`)
- Captures all sent emails in `.local-inbox.json`.
- View captured emails and 6-digit OTPs at `http://localhost:3000/dev/inbox` (or `http://localhost:3000/api/dev/inbox`). Both routes strictly return HTTP `404` unless `NODE_ENV="development"`.

### 5. Run Automated Tests & Typecheck
```powershell
npm run typecheck
npm test
npm audit
```

### 6. Start Development Server
```powershell
npm run dev
```

- **Public Storefront:** `http://localhost:3000`
- **Admin Portal (Unlinked, 2FA Protected):** `http://localhost:3000/ops-portal`
- **Dev Email Inbox Page:** `http://localhost:3000/dev/inbox` (returns `404` outside `NODE_ENV=development`)

## Production Compliance Build Check (`DEPLOYMENT_TARGET`)
In `src/config/brand.ts`, the statutory Grievance Officer name (`GRIEVANCE_OFFICER_NAME`), Registered Office address (`REGISTERED_OFFICE_ADDRESS`), and Seller GSTIN (`SELLER_GSTIN`) default to `PLACEHOLDER_` values until legal/accounting sign-off.

Because Next.js unconditionally sets `NODE_ENV="production"` during `next build` (even when `.env` sets `NODE_ENV="development"`), `src/config/brand.ts` uses an explicit `DEPLOYMENT_TARGET` variable (`"local-preview"` vs `"production"`) together with multi-signal deployment detection:

1. **Local Preview Builds (`DEPLOYMENT_TARGET="local-preview"`):**
   - Configured in `.env.example` and `.env` alongside `NEXT_PUBLIC_APP_URL="http://localhost:3000"`.
   - Allows `npm run build` and `npm start` on a local machine while `GRIEVANCE_OFFICER_NAME`, `REGISTERED_OFFICE_ADDRESS`, and `SELLER_GSTIN` remain unconfigured placeholders.
   - Logs a `[LOCAL PREVIEW BUILD]` warning during `next build` and renders those fields in the footer and legal pages as explicitly `Unconfigured (... - local preview placeholder)` so they are never represented as verified legal data.
2. **Production Deployment Builds (`DEPLOYMENT_TARGET="production"`):**
   - `assertNoPlaceholdersInProduction()` and `assertEmailProviderConfig(..., { enforceProduction: true })` fail the build immediately if any of the required legal fields (`GRIEVANCE_OFFICER_NAME`, `REGISTERED_OFFICE_ADDRESS`, `SELLER_GSTIN`) or email credentials (`EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` / `RESEND_API_KEY`) are missing, `"console"`, or contain placeholder values.
3. **Production Lock (Cannot Be Silently Disabled in Production):**
   - Even if `DEPLOYMENT_TARGET="local-preview"` or `ALLOW_PLACEHOLDER_BRAND_IN_BUILD="true"` is accidentally present, `resolveBuildDeploymentMode()` unconditionally forces `"production"` compliance validation whenever:
     - `DEPLOYMENT_TARGET="production"`, **OR**
     - Any managed cloud or CI deployment platform variable is set (`VERCEL`, `VERCEL_ENV`, `CF_PAGES`, `RAILWAY_ENVIRONMENT`, `RENDER`, `FLY_APP_NAME`, `AWS_EXECUTION_ENV`, `K_SERVICE`, `HEROKU_APP_ID`, `NETLIFY`, `DO_APP_PLATFORM`, `CI_DEPLOYMENT`), **OR**
     - `NEXT_PUBLIC_APP_URL` is configured to any non-localhost domain (e.g. `https://kalaandkiln.in`), **OR**
     - `NODE_ENV="production"` and no explicit local-preview flag is set (fail-closed default).

## Allowed Email Domains Policy (`ALLOWED_EMAIL_DOMAINS`)
Customer registration and unverified email address changes enforce domain whitelisting configured via `ALLOWED_EMAIL_DOMAINS`.
- **Default:** `gmail.com,googlemail.com`
- **Normalization:** Gmail and Googlemail addresses are automatically canonicalized: dots in the local-part are removed, `+alias` tags are stripped, and `googlemail.com` is mapped to `gmail.com`. The canonical string is stored in a separate unique `canonical_email` column, while preserving the user's typed address for display and email delivery.
- **Customization:**
  - To allow additional domains, update `.env`:
    ```env
    ALLOWED_EMAIL_DOMAINS="gmail.com,googlemail.com,outlook.com,yahoo.com"
    ```
  - To allow all domains without restriction, set:
    ```env
    ALLOWED_EMAIL_DOMAINS="*"
    ```
- **User Experience:** When an unregistered or disallowed domain is submitted, the platform displays a clear, helpful message:
  *"Only Google email accounts (@gmail.com, @googlemail.com) are currently accepted for customer registration. Please use a Gmail address."*

## Authentication Architecture & Security Rationale

### Customer Login (Email + Password)
- Customer logins strictly use email and password (hashed with Argon2id), with automatic lockout and Cloudflare Turnstile protection on repeated failures.
- **Why email OTP is NOT used on routine customer login:**
  1. **Latency & Friction:** Emailed OTPs introduce 2 to 30 second inbox delays, causing cart abandonment and poor shopping experience.
  2. **Quota & Deliverability Preservation:** Routine logins would rapidly exhaust daily transactional quotas (`EMAIL_DAILY_LIMIT`), reserving SMTP/API bandwidth for critical order receipts and account verification.
  3. **Offline Reliability:** Customers can sign in even during third-party transactional email outages.
- **Future New-Device Challenge Roadmap:**
  A lightweight new-device detection system can be added without burdening routine logins:
  - Generate a cryptographic device fingerprint hash (`HMAC(userAgent + clientSubnet, SECRET)`) stored in a signed persistent cookie (`__Host-device-id`).
  - When a customer signs in from an unrecognized device hash or a high-risk geo-IP shift, issue a temporary device challenge token and send a 6-digit confirmation OTP before authorizing the session.

### Admin Portal Login (Email + Password + RFC 6238 TOTP)
- The Admin portal (`/ops-portal`) requires email, password, and mandatory RFC 6238 TOTP 2FA (Google Authenticator, 1Password, etc.).
- First-time login forces an immediate password change and displays a secure TOTP enrollment QR code and recovery codes.
- **Why TOTP is preferred for Admin over email OTP:**
  1. **Zero Deliverability Dependency:** TOTP operates completely offline on the admin's authenticator device; it is immune to email outages, SMTP delays, and DNS hijackings.
  2. **Cryptographic Protection Against Email Account Takeover:** Even if the admin's email account is compromised, the attacker cannot access the store administration console without the physical authenticator app seed.

## Email Deliverability Checklist & Production Plan

### Development & Staging Deliverability Checklist
1. **Dedicated Store Google Account:** Use a dedicated store Gmail account (e.g., `orders.kalaandkiln@gmail.com`) rather than a personal account.
2. **2-Step Verification & App Password:** Enable 2-Step Verification and generate a dedicated Google App Password for local testing (`npm run email:test`).
3. **Spam Folder Inspection:** Send a test message with `npm run email:test -- your-inbox@gmail.com` and inspect the inbox:
   - Check if the email lands in the Primary tab or Spam folder.
   - Confirm sender display name matches `Kala & Kiln <orders@kalaandkiln.in>`.
   - Verify that plain text and HTML bodies render cleanly with 34px bold OTP code.
   - Confirm zero links/URLs, zero em dashes, zero emojis, and code excluded from subject.

### Production Infrastructure Plan (Resend / AWS SES)
Before launching to production customers:
1. **Dedicated Domain:** Provision a verified custom domain (e.g., `kalaandkiln.in`).
2. **Transactional Email Provider:** Transition from Gmail SMTP to Resend or AWS SES with high-reputation IP pools.
3. **DNS Authentication Records:**
   - **SPF (Sender Policy Framework):**
     ```txt
     v=spf1 include:resend.com ~all
     ```
   - **DKIM (DomainKeys Identified Mail):**
     Configure 2048-bit DKIM keys provided by the email service provider to sign outgoing messages.
   - **DMARC (Domain-based Message Authentication, Reporting, and Conformance):**
     ```txt
     v=DMARC1; p=reject; rua=mailto:dmarc-reports@kalaandkiln.in; pct=100; adkim=s; aspf=s
     ```
4. **Verified From Address:**
   Set `EMAIL_FROM="Kala & Kiln <orders@kalaandkiln.in>"` matching the authenticated DKIM/SPF domain.
5. **Daily Send Quota & Warmup:**
   Monitor `EMAIL_DAILY_LIMIT` in Redis; start with a 50 to 100 email/day warmup schedule before scaling to general public launch.
