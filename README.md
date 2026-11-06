# Udyam Digital

Local hackathon application for catalogue recommendations, customer onboarding, document checks and order tracking. All supplied businesses, identifiers and registry records are fictional.

## Run

Node.js 24+ is required. Preserve existing `.env` and `var/` files.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run kyc:setup
npm run db:migrate
npm start
```

Open http://localhost:3000. Customer sign-in through Clerk is mandatory before opening business setup or placing orders. Configure `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in ignored `.env`. Never publish the secret key. Clerk handles Google/email sign-in according to its dashboard settings.

For a new local PostgreSQL installation, start Docker Desktop and run `npm run db:setup` before migrations. For the existing installation, use `docker start udyam-advisor-postgres`. Never remove its volume to fix tests. PostgreSQL holds conversations and requirements; SQLite in `var/` holds orders, support and encrypted KYC records.

Set `GROQ_API_KEY` and `AI_PROVIDER=groq` for live advice. Provider limits apply. Optional providers are configured in `.env.example`; no paid fallback is automatic. Local English OCR needs no model API key, supports JPEG/PNG/PDF, and allows up to four pages per PDF and 2 MB per file.

## Customer and staff flows

- Customers sign in, choose services, review the fixed demo quote, complete consented document checks and track orders.
- Account orders/chats expire after seven days of inactivity. KYC files expire after seven days from case creation. Existing guest records require explicit linking from their original browser session; names/emails do not grant ownership.
- Staff start from the main page's **Staff portal** link, enter the access code configured as `KYC_REVIEWER_TOKEN` once, then use the portal navigation to open Sales or KYC Review. Customer Clerk login does not grant staff access. The same shared demo staff session authorizes both pages; it is not a production role system.
- Sales replies and reviewer correction messages appear when the customer refreshes the tracker. Corrected documents update the existing order without changing its original quote.
- Prices and rules come from the supplied catalogue. The fixed demo quote uses catalogue minimums, with the original range shown for reference. Actual provider price and availability need confirmation; taxes are excluded.
- Government lookups, staff workflows and installation/activation are simulations. No payments, real provisioning, email or WhatsApp messages are connected. Staff authentication is shared local authorization, not production role management.

## Checks

```powershell
npm test
npm run test:postgres
npm run analyze
npm run check:smart-kyc
```

Tests use isolated databases. PostgreSQL integration creates and drops only its temporary test database. `npm run check:ai` runs live synthetic prompts and consumes provider quota. `python scripts/package-source.py` builds an allowlisted source ZIP without secrets, installed dependencies or customer databases.

## Project reference

- [Project instructions](AGENTS.md)
- [Requirements](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Implementation history](docs/implementation-plan.md)
- [API](docs/API.md)
- [Smart KYC](docs/smart-kyc.md)
- [Privacy](docs/privacy-note.md)
- [Business case content](docs/business-case.md)
- [Submission checklist](docs/submission-checklist.md)

`reports/` retains aggregate lead analysis, specimen validation and dataset integrity evidence. The supplied dataset stays unchanged in `YTL_TrackA_Udyam_Digital_Data/`. Original source archives and the confidential case materials are kept locally and are not included in this repository. Existing `output/submission/` deliverables are retained, but predate recent account/reply changes and need updating before submission. The latest round calls for one introduction plus seven evaluated slides, a presentation below 20 MB and a demo hyperlink; deadline: 7 November 2026 at 11:59 PM.

## Folder layout

```text
public/          Customer, sales and reviewer HTML/CSS/JavaScript
src/             Backend rules, AI, authentication and storage
tests/           Rule, API, security, OCR and database tests
scripts/         Setup, migration, analysis and validation tools
migrations/      PostgreSQL and SQLite schema migrations
docs/            Requirements, architecture, API and operating notes
reports/         Aggregate dataset and specimen evidence
reference/       Local-only case material and source archives
YTL_TrackA_Udyam_Digital_Data/  Unmodified supplied dataset
output/          Existing submission deliverables (ignored)
var/             Private databases and local settings (ignored)
tmp/             Local scratch files (ignored)
```

`server.mjs`, package manifests, `README.md` and `AGENTS.md` remain at the root. Web URLs stay unchanged; `public/` is served through the existing asset allowlist, not as an unrestricted directory. `.env` stays at the root and is never served.
