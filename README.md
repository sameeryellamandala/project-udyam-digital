# Udyam Digital

A local hackathon prototype for Accel Business: discover suitable business services, build a transparent quote, submit KYC for checking and save/track an order.

## Start
Requires Node.js 24 or newer. From this folder:

```powershell
Copy-Item .env.example .env
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). Install from the lockfile with `npm ci`; this includes the local OCR reader and English model. Copy `.env.example` only if `.env` does not already exist. Do not open `index.html` directly; the screens use the backend.

For live testing, set `GROQ_API_KEY` in your private `.env` and keep `AI_PROVIDER=groq`. The default testing model is `openai/gpt-oss-120b`, served by Groq. Your account's usage limits apply. Without a key or during an outage, the app uses labelled guided discovery. No key is included in the source package. Local OCR reads the supplied English forms on this computer. This is synthetic data; no real government or installation service is connected.

## Project documents
Start with [requirements](PRD.md), [implementation plan](implementation-plan.md), [design](design.md), [architecture](architecture.md), [database](database.md), [API](API.md) and [agent instructions](AGENTS.md).

Operational guides: [installation](setup-and-installation.md), [initialization](initialization.md), [feature development](feature-development.md), [security](authentication-and-security.md), [integrations](integrations.md), [MCP](mcp-connections.md), [QA](testing-and-qa.md), [debugging](debugging.md), [submission](submission-checklist.md).

## Status and limits
Implemented: CSV-backed recommendations, editable server-priced quotes, consent and mock registry checks, an optional AI chat/image extraction adapter, and SQLite-backed session-owned orders. The no-key assisted-review journey has been walked through in the browser, including refresh and mobile tracker layout. Automated rule/API checks are included.

Groq has been tested live with synthetic English and Hindi inputs, and the browser walkthrough exercised the live advisor. All 47 supplied images have been processed locally: 44 meet parser readability requirements and three need a clearer image/manual review. Matching fields never override cancelled registrations or expired documents. Saved orders belong to this browser session; there is no cross-device login yet. Taxes are excluded, rates use catalogue minimums, and installation times are estimates requiring confirmation. Raw documents are not saved. English/Hindi controls, service descriptions and common errors are localized; canonical product names stay as supplied. No real partner receives the review orders.

## Development
`npm test` runs isolated automated tests. Local data is in ignored `var/`. Server exposes only approved web assets, not the dataset, database, environment or source archives.

## Business evidence and demonstration
Run `npm run analyze` to regenerate the aggregate [lead report](reports/lead-analysis.md), without customer records in the output. Review [business-case content](business-case.md), the [privacy note](privacy-note.md) and [demo script](demo-script.md) for submission preparation.

## Provider settings
For a later paid OpenAI evaluation, explicitly set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`, then restart. There is no automatic paid fallback. Groq testing uses local OCR. External image reading requires the explicit OpenAI setup and separate consent.

## Submission outputs
`output/submission/` contains the editable ten-slide deck, one-page privacy PDF, architecture PDF, narrated app-screen demo and source ZIP. The video uses actual captured app screens with local synthesized narration. A public code repository has not been published. See `reports/final-qa.md` for evidence and limitations.

## Additional checks
`node scripts/check-documents.mjs` checks the entire image pack locally. `node scripts/check-ai.mjs en` or `hi` makes a live synthetic provider test and consumes quota. `python scripts/package-source.py` creates an allowlisted archive excluding `.env`, local orders and dependencies.
