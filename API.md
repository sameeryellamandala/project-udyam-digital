# HTTP API contract

Base: same-origin `/api`. JSON requests/responses. Session cookie issued by `GET /api/session`; API mutations require same-origin requests. Static files use an allowlist. No raw registry dump endpoint.

| Method | Path | Input | Result |
|---|---|---|---|
| GET | /api/session | none | Session availability, AI mode, fixed KYC date |
| GET | /api/catalogue | none | Public 25-product catalogue |
| POST | /api/recommend | `{profile}` | Validated profile, quote, eligible products, warnings |
| POST | /api/quote | `{profile, items}` | Revalidated quote; items are `{productId, quantity}` |
| POST | /api/advisor | `{profile, messages}` | Structured reply and proposed profile; guided mode on provider failure |
| POST | /api/verify | `{profile, contact, consent, extractionMethod, aiConsent, documents}` | Stored verification ID, masked result and issues |
| POST | /api/orders | `{profile, contact, items, verificationId, requestKey}` | Saved order after server repricing |
| GET | /api/orders | none | Session-owned order summaries |
| GET | /api/orders/:id | none | Session-owned order snapshot or 404 |
| DELETE | /api/orders/:id | none | Delete own order |

## Profile
`businessName`, `segment` (`micro`, `prof`, `multi`, `mfg`), `employees` (1-10000), `sites` (1-1000), `cityTier` (1 or 2), `budget` (monthly rupees), `needs` (internet/mobile/email/backup/security/pos/whatsapp/cctv/iot), `currentTools`, `language` (`en`/`hi`), optional `gstin`/`udyam`. Inputs are length/range/type checked. Registrations are sent only when the user proceeds with consent.

## Documents and privacy
Documents: array of `{kind, dataUrl}`; kind in `gst`, `udyam`, `address`, `signatory`. JPEG/PNG only, maximum 2 MB per image, at most four. Whole request limit 12 MB; normal endpoints 64 KB. Server validates image signature, requires KYC consent, and requires separate AI permission before external processing. Without extraction, result remains review-required. No filename-based verification.

## Responses
Errors: `{error, code}`. Typical statuses: 400 invalid data/eligibility, 403 origin/consent, 404 inaccessible ID, 413 oversized input, 429 rate limit, 503 temporary unavailability. Do not echo secrets, raw IDs or provider errors. Quotes include `monthly`, `setup`, `contractMonths`, `installDays`, `taxNote`, `items`, `warnings`.

Orders use `review_required` or `ready_for_scheduling`; neither means installed. Reusing a request key returns the existing order. Order creation accepts only a verification created by this session for this profile.

## Document-reading modes
`extractionMethod` is `local` (default), `manual` or `ai`. Local OCR uses the installed English model and supplied layouts. AI requires a configured key and `aiConsent:true`. Upload dimensions must be at least 100 pixels per axis and at most 12 megapixels in addition to the existing 2 MB size cap. Results include per-document reader/status/issues without raw OCR text. Verification binds to normalized contact details as well as the profile.

## Provider status
`GET /api/session` returns `provider`, `model` and `externalImageReading` capability without credentials. Groq is the testing default. Chat uses strict schema first and one bounded same-provider JSON-mode retry for strict-decoder failures, followed by local schema/price checks. Guided fallbacks carry a safe reason code. No automatic paid fallback.
