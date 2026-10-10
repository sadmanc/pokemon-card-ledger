# Card Ledger

A private, single-user ledger for tracking a Pokémon card and sealed-product collection, buys and sells, trades, cash reserves, platform credits, valuations, and realized profit. Values are recorded in CAD.

The public repository contains application source only. It does not include a user database, inventory, transaction history, credentials, or deployment project state. Each deployment must be configured with its own Google OAuth credentials, allowed account, session secret, and PostgreSQL database.

## Requirements

- Node.js 22 or newer
- PostgreSQL database (Neon works with the included serverless driver)
- Google OAuth web client

## Run locally

1. Copy `.env.example` to `.env.local` and set each value. Set `GOOGLE_ALLOWED_EMAIL` to the one Google account allowed into this deployment.
2. In Google Cloud Console, add `http://localhost:3000/auth/google/callback` as an authorized redirect URI for the OAuth client.
3. Apply the schema once: `psql "$DATABASE_URL" -f drizzle/0000_card_ledger.sql`.
4. Install and run: `npm ci`, then `npm run dev`. Open `http://localhost:3000`.

The database is owner-scoped, and sign-in rejects accounts other than `GOOGLE_ALLOWED_EMAIL`. Keep the account allowlist and database private to the intended user. This app is designed as a single-user deployment; do not expose it as an unauthenticated public service.

## Deploy

Deploy the repository as a Next.js application on a host that supports Node.js and PostgreSQL. Set `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAIL`, and `GOOGLE_SESSION_SECRET` in the host's encrypted environment settings. Add `https://YOUR_HOST/auth/google/callback` to the Google OAuth client's authorized redirect URIs. Apply the SQL schema to the production database before the first sign-in.

Generate a strong session secret with `openssl rand -base64 48`. Never commit `.env.local`, production environment files, or database exports.

## Data model

The schema stores items, transactions, trade line items, valuation observations, and dated portfolio snapshots. The UI allows manual valuation updates and records a source/date; automatic PriceCharting lookup is not included.
