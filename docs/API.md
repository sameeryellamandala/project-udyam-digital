# HTTP API contract

## Smart KYC extension

When retained storage is enabled, `POST /api/verify` requires `consent:true` and `consentVersion:"2026-10-smart-kyc-v3"`. Documents accept `{kind,name?,dataUrl}` or an owned `{kind,documentId}`. Optional `caseId` updates the same case, preserving unchanged files and versioning replacements. Existing session/revision, profile and contact binding remain enforced. Certificate numbers can be read when input boxes are empty. Results expose masked fields, extraction/confidence/source, registry findings, corrective actions and private file references. `fieldsReviewed:true` is required at checkout when extracted fields were shown.

| Method | Path | Purpose |
|---|---|---|
| POST | /api/kyc/preview | Consent-bound local image/first-page preview |
| GET | /api/kyc/cases?journeyId=:id | Owner's retained cases for the journey |
| GET | /api/kyc/cases/:id | Owner's result, references, history and submitted contact |
| POST | /api/kyc/cases/:id/review-request | `{consent:true}`; owner requests local assisted review for unresolved findings |
| DELETE | /api/kyc/cases/:id | Delete case descendants; immutable orders stay |
| GET | /api/kyc/documents/:id/preview | Owner/authorized reviewer; safe image preview |
| GET | /api/kyc/documents/:id/download | Owner/authorized reviewer; original attachment |
| POST | /api/kyc/reviewer/login | Private access code; one-hour reviewer cookie |
| POST | /api/kyc/reviewer/logout | Revoke the reviewer session |
| GET | /api/kyc/reviewer/cases | Authorized simulated review queue |
| GET | /api/kyc/reviewer/cases/:id | Authorized details and masked fields |
| POST | /api/kyc/reviewer/cases/:id/decision | approved/rejected/correction_requested plus comment |

Every case/file request checks ownership or reviewer authorization and expiry. Deterministic errors block approval with 409. Review decisions create a new bound verification snapshot and make older IDs stale. Encrypted retained context supports masked-ID resume without exposing full registration numbers. No real government, billing, reviewer notification or provisioning integration is connected. See `smart-kyc.md` for retention, setup and specimen evidence.

Verification results include measured `processingMs` and per-document reader times where available. Review requests check the current journey revision, preserve the existing verification and are idempotent while pending. The case result exposes `reviewRequest:{status,requestedAt,simulated:true}`; a reviewer decision completes the request. Already-passed checks return 409 `REVIEW_NOT_NEEDED`. No external notification is sent.

Base: same-origin `/api`. JSON requests/responses. Session cookie issued by `GET /api/session`; API mutations require same-origin requests. Static files use an allowlist. No raw registry dump endpoint.

| Method | Path | Input | Result |
|---|---|---|---|
| GET | /api/session | none | Session availability, AI mode, fixed KYC date |
| GET | /api/catalogue | none | Public 25-product catalogue |
| POST | /api/recommend | `{profile}` | Validated profile, quote, eligible products, warnings |
| POST | /api/quote | `{profile, items}` | Revalidated quote; items are `{productId, quantity}` |
| POST | /api/advisor | `{profile, messages}` | Structured reply and proposed profile; UI shows an unavailable notice if no live reply is returned |
| POST | /api/verify | `{profile, contact, consent, extractionMethod, aiConsent, documents}` | Stored verification ID, masked result and issues |
| POST | /api/orders | `{profile, contact, items, verificationId, requestKey}` | Saved order after server repricing |
| GET | /api/orders | none | Session-owned order summaries |
| GET | /api/orders/:id | none | Session-owned order snapshot or 404 |
| DELETE | /api/orders/:id | none | Delete own order |
| POST | /api/orders/:id/support | `{topic, message}` | Save a session-owned help request; not externally routed |
| POST | /api/orders/:id/demo-advance | `{}` | Simulate the next installation/activation status for a KYC-passed order |
| GET | /api/sales/queue | none | Synthetic lead-priority queue, aggregate metrics and minimized help topics |
| POST | /api/sales/handoff | `{leadId}` | Queue a synthetic dropped lead for local salesperson follow-up |
| POST | /api/sales/support/review | `{id}` | Mark a local help request reviewed |

## Profile
`businessName`, `segment` (`micro`, `prof`, `multi`, `mfg`), `employees` (1-10000), `sites` (1-1000), `cityTier` (1 or 2), `budget` (monthly rupees), `needs` (internet/mobile/email/backup/security/pos/whatsapp/cctv/iot), `currentTools`, `language` (`en`/`hi`), optional `gstin`/`udyam`. Inputs are length/range/type checked. Registrations are sent only when the user proceeds with consent.

## Documents and privacy
Documents: array of `{kind, dataUrl}`; kind in `gst`, `udyam`, `address`, `signatory`. JPEG, PNG or PDF, maximum 2 MB each; PDF uploads may contain up to four pages total. Whole request limit 12 MB; normal endpoints 64 KB. Server validates signatures, requires KYC consent, and requires separate AI permission before external processing. Transient masked OCR fields are returned for customer review but stripped from persisted verification data. No filename-based verification.

## Responses
Errors: `{error, code}`. Typical statuses: 400 invalid data/eligibility, 403 origin/consent, 404 inaccessible ID, 413 oversized input, 429 rate limit, 503 temporary unavailability. Do not echo secrets, raw IDs or provider errors. Quotes include `monthly` (range minimum), `monthlyMax`, `setup`, `contractMonths`, `installDays`, `taxNote`, `items`, `warnings`; each item also includes `unitPriceMax` and `monthlyMax`.

Orders use `review_required`, `ready_for_scheduling`, `installation_scheduled`, `installed` or `activated`. Later statuses are demo-only transitions and visibly labelled; none proves real provisioning. Reusing a request key returns the existing order. Order creation accepts only a verification created by this session for this profile.

## Document-reading modes
`extractionMethod` is `local` (default), `manual` or `ai`. Local OCR uses the installed English model and supplied layouts. AI requires a configured key and `aiConsent:true`. Upload dimensions must be at least 100 pixels per axis and at most 12 megapixels in addition to the existing 2 MB size cap. Results include per-document reader/status/issues without raw OCR text. Verification binds to normalized contact details as well as the profile.

## Provider status
`GET /api/session` returns `provider`, `model` and `externalImageReading` capability without credentials. Groq is the testing default. Chat uses strict schema first and one bounded same-provider JSON-mode retry for strict-decoder failures, followed by local schema/price checks. The API may return a guided result on provider failure, but the customer UI suppresses it and shows the unavailable notice. No automatic paid fallback.

## Advisor responses
`POST /api/advisor` now returns `{mode,reply,proposedProfile,quote,options,eligibleProducts,warnings,proceed}` after requirement extraction and backend validation. Collected fields automatically update the browser profile. `options` contains backend-priced bundles suitable for review, not orders. `proceed` requires an explicitly confirmed, previously offered valid package and a collected business profile. An internal session-owned conversation summary is not returned to the browser. Model failures return `{mode:"unavailable",fallbackReason}` with no generated fallback reply. The UI shows a generic unavailable alert; server diagnostics record only a safe error code.


## PostgreSQL advisor conversations

All paths below use `/api`, the existing browser ownership cookie, same-origin validation, limits and JSON error conventions. Caller-provided user IDs are never used. PostgreSQL must be configured and migrated; storage errors return 503 without driver details.

| Method | Path | Body / result |
|---|---|---|
| POST | /api/sessions | `{title?}`; creates empty independent memory |
| GET | /api/sessions | `{sessions:[{id,title,status,createdAt,updatedAt,preview}]}` |
| GET | /api/sessions/:id | metadata, latest 100 messages, requirements, advisorProfile, offers, hasMore |
| GET | /api/sessions/:id/messages?before=:messageId | chronological page of up to 100 older messages |
| GET | /api/sessions/:id/requirements | `{requirements}` with unknown values as null |
| POST | /api/sessions/:id/chat | `{message,requestId,language?}`; UUID retry key, <=2000 characters |
| DELETE | /api/sessions/:id | cascade-deletes chat data; leaves orders intact |

Wrong-owner and missing conversations both return 404. Duplicate chat request IDs return the originally stored response. A chat row lock prevents lost simultaneous updates. Stored history (last 10 messages) and structured requirements supply model context; arbitrary client history and form defaults are ignored. Provider-unavailable turns are recorded without changing memory; a fresh request ID retries the provider. Seven-day ownership expiry remains the existing prototype policy.


## Shared journey extension

- `POST /api/sessions` accepts an optional full onboarding `profile` and UUID `requestId`. A repeated request key under the same owner returns the same session ID. Without a profile it starts empty, as before.
- `POST /api/sessions/:id/requirements` accepts `{profile,revision,requestId}`. It confirms the entire submitted form while preserving chat-only details such as explicit SIM counts for services that remain selected. Removed services and obsolete quote selections are cleared. A stale revision returns 409 `STALE_REQUIREMENTS`; exact retries return the original response.
- `GET /api/sessions/:id` and `GET /api/sessions/:id/requirements` return the canonical public requirements, requirement revision, form-confirmed flag and safe advisor profile. The full session response also returns a fresh backend recommendation.
- `GET /api/sessions/:id/recommendation` returns `{sessionId,revision,requirements,advisorProfile,formConfirmed,recommendation}` from the saved requirements.
- The existing `POST /api/recommend`, `/api/quote`, `/api/verify` and `/api/orders` accept `{sessionId,revision,...existingFields}`. When supplied, ownership and revision are checked, and the profile's business needs are loaded from PostgreSQL; conflicting client business needs are ignored. Only language and separately consented GST/Udyam inputs remain transient client fields. The legacy no-session API remains compatible.
- Explicit quote edits are stored in `selectedProducts` separately from requested services and suggested offers. They are repriced on the backend and discarded when requirements change. Quote/order snapshots include the journey ID and requirement revision. KYC verification reuse across journeys or revisions returns 409 `STALE_VERIFICATION`.

The revision represents requirements, not message count: courtesy/general-question turns do not invalidate verification or replace selections when they leave requirements unchanged.
# Current quote pricing policy — 1 November 2026

## Clerk customer identity

Customer authentication is mandatory by default: orders, sessions, recommendation, quote, advisor, verification and customer KYC APIs return 401 without verified Clerk identity. Public bootstrap `/api/auth/config` includes `required:true`; sign-in UI remains available. Staff reviewer routes retain separate authorization. A customer token is required to create any order.

`GET /api/auth/config` returns only enabled state, publishable key and configured frontend domain. `GET /api/session` includes `auth.enabled`, `auth.signedIn` and the count of current guest-cookie orders eligible for linking. Signed-in frontend requests send a refreshed Clerk bearer token; private document requests can use Clerk's same-origin session cookie. Signature/expiry/issuer/origin are verified using the official backend SDK. An invalid bearer returns 401; an invalid stale cookie grants no account identity and can fall back only to guest ownership.

`POST /api/auth/claim` (empty JSON body) requires a valid Clerk identity plus the existing guest cookie and same-origin request. It links that guest's PostgreSQL histories and SQLite orders, verifications, support requests and KYC cases to the verified account. Calls are retry-safe; no caller-supplied owner, email or business name is accepted. Other browsers' lost guest cookies cannot be recovered this way. SQLite/PG moves are separately transactional; a failure preserves records and can be retried, rather than pretending a distributed transaction exists. Local demo records expire after seven days of inactivity; KYC case originals have an independent absolute seven-day cap.

## Staff replies and document corrections

All `/api/sales/*` endpoints require the existing authorized local reviewer/staff session cookie. Sign in through `/api/kyc/reviewer/login`; the main page's Staff portal uses this same endpoint and the ignored `KYC_REVIEWER_TOKEN`. `GET /api/staff/session` reports only whether the current request has an authorized staff session. This is shared staff authorization, not distinct production sales/reviewer roles.

- `POST /api/sales/support/reply`: `{id,message,status}`; authenticated staff only, 5–1000 characters, status `replied` or `resolved`. Replies are identifier-redacted, appended and linked to the existing request/order.
- `GET /api/orders/:id`: owner-only; includes support request `replies` and owner-scoped `kycReview` decision messages when a retained case is linked. Refresh the tracker to retrieve new messages. No email/WhatsApp is sent.
- `POST /api/orders/:id/verification`: `{verificationId,fieldsReviewed}`; owner-only, validates current owned case, original order profile/contact/journey, latest requirement revision, field acknowledgement and backend eligibility. Requires passed checks. Appends a verification audit update to the existing order; retries of the same verification are idempotent. Original quote and original verification remain preserved.
- Reviewer correction/rejection decisions place linked orders on review hold. Rechecking alone does not release that hold; the customer submits corrected checked evidence. Deleting a retained case cannot erase a recorded hold. Known deterministic errors still cannot be approved.

SQLite add-only tables `support_replies` and `order_kyc_updates` retain message history and correction audits; foreign keys cascade with request/order deletion. Reviewer comments remain encrypted in KYC storage; only redacted messages are returned to the correct customer.

Backend quote responses include `checkoutMonthly` (sum of supplied catalogue minimums), `pricingPolicy: catalogue_minimum_demo_v1` and `pricingNote`. Existing `monthly`/`monthlyMax` retain catalogue bounds. `/api/orders` recalculates prices, ignores client-supplied totals/policies and snapshots the new fields. Existing saved-order snapshots are not migrated or repriced. This is a disclosed fixed demo quote, not a confirmed provider tariff.

