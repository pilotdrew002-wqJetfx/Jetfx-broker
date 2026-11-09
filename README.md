# JetFx full-stack broker prototype

This package upgrades the visual website into a runnable Node.js application with a SQLite database, customer registration/login, demo account records, simulated orders, and a restricted admin overview.

## Run locally
1. Install Node.js 20 or newer on a computer/server.
2. Copy `.env.example` to `.env`.
3. Set a long random `JWT_SECRET`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`.
4. In this folder run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000` for the customer site.
6. Open `http://localhost:3000/admin` for the admin panel.

The first start creates the SQLite database and the administrator account from `.env`. Do not use the example credentials in a public deployment.

## Included
- Responsive customer-facing JetFx site
- Customer registration and login (bcrypt password hashing, JWT sessions)
- Per-customer demo account record
- Demo order creation and history
- Admin login and basic operational overview
- Rate limiting, Helmet security headers, SQLite foreign keys and audit events
- CSV export of the signed-in user's demo orders

## Deliberate prototype limits
This is NOT a live broker and is not ready to accept customers' money. Quotes are hard-coded illustrative values. Orders are stored as DEMO records and are never sent to a market. Wallet, deposits, withdrawals, KYC document collection, real-time quotes, live execution, custody and payment integrations are not implemented. Do not advertise it as a regulated broker or collect deposits through it.

## Before any real-money launch
A production brokerage needs jurisdiction-specific legal advice and the correct licences/authorisations; a regulated execution/liquidity provider; custody and safeguarded client-money arrangements; a compliant payment provider; identity and AML/sanctions screening; audited ledgers and reconciliations; robust role-based access, MFA, encryption and monitoring; backups, disaster recovery, penetration testing and independent compliance review. Provider API credentials must stay server-side and be stored in a secrets manager. Never put them in browser JavaScript.

The backend uses demo-only balances and fixed demo prices so it can be tested safely while the commercial, regulatory and provider decisions are made.
