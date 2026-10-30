# Database design

## Initial implementation
SQLite at `var/udyam.sqlite`, automatically created on start. Never expose `var/` through HTTP or commit it. Prepared statements only. Foreign keys enabled. Orders use random IDs and session ownership.

| Table | Fields | Purpose |
|---|---|---|
| sessions | id_hash PK, created_at, expires_at | Store hash of random HttpOnly cookie; seven-day local session |
| verifications | id PK, session_hash FK, profile_hash, result_json, created_at | Server-generated consent and KYC result bound to the profile |
| orders | id PK, session_hash FK, request_key, profile_json, contact_json, quote_json, verification_json, status, created_at | Stable snapshot and retry-safe checkout |

Unique `(session_hash, request_key)` prevents duplicate checkout on retry. A verification cannot be reused for a different normalized profile. An order embeds its verification snapshot so deleting transient checks does not silently alter order history.

## Source data
Read product/GST/Udyam CSVs at startup, indexed in memory. Do not copy them into browser bundles. Product prices are integer rupees; monthly and setup totals remain separate. Leads data is for aggregated analysis and submission evidence, not customer authentication or model training.

## Data minimization
Raw uploaded images are processed in memory and not persisted. Store issue codes, masked identifiers, consent timestamp/version and validation outcome; avoid storing raw extracted signatory IDs. Contact details stay server-side. Prototype SQLite is not encrypted at rest.

## Lifecycle and evolution
Expire sessions/checks/orders after seven days using startup/request cleanup. User can delete their session's saved orders from the tracker. This prototype retention is a design choice, not a statutory retention claim. Before production establish legally reviewed retention and backups. Later split order items/events, document metadata, customers and partner roles into normalized tables when real fulfillment is added.

## Local reader findings
Verification JSON now includes per-document status/reader/issue summaries. Raw OCR text and signatory ID numbers are not stored. Existing rows remain readable; old rows without document summaries show their original saved findings. No destructive migration is required.
