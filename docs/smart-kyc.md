# Smart KYC

Expiry is enforced on access; physical deletion follows the existing startup/API-activity cleanup approach. If the app is stopped, encrypted records stay on disk until its next cleanup. This is a local prototype mechanism, not a statutory retention certification.

Run the updated application:

```powershell
npm ci
npm run kyc:setup
npm run db:migrate
npm start
```

Setup creates missing encryption and reviewer settings in ignored `.env`, without displaying them or replacing existing keys. Preserve the encryption key with the local database. Startup applies `migrations/sqlite/001_smart_kyc.sql` transactionally with a recorded checksum. PostgreSQL session migrations remain separate; existing orders are preserved.

Refresh and accept the updated v3 consent. Older clients must reload because the previous consent covered in-memory reading, not retained originals. Previous uploads were not retained and cannot be reconstructed; upload them again.

## Reading and checks

The default reader needs no AI key. PDF.js reads usable text layers; scanned PDFs are rendered locally and read by installed English Tesseract OCR. PNG/JPEG images use local OCR. Each document fails independently. Limits are 2 MB/file, four categories and four pages per PDF, with bounded pixels and OCR runtime. Private previews show the first PDF page; an owned original can be downloaded. Optional external reading requires OpenAI configuration and separate consent.

Certificate numbers can be extracted when input boxes are empty. Lookup uses the actual supplied 3,534 GST and 2,723 Udyam records, accepting synthetic PAN X and Udyam district 00. Checks cover format/checksum, entered/extracted numbers, registry status, legal/trade/enterprise names, signatory name, installation/registry addresses and cross-document consistency. Document age and expiry use 15 July 2026: address proof must be within the prior 90 days. Small name differences require confirmation, not a fraud declaration. Registration certificates are not universally mandatory; unrestricted products remain available without GST/Udyam.

Each result separates upload, extraction, confidence when available, mock-registry lookup, field validation, failure reason and corrective action. A registry or field match is not proof of authenticity. Replace only the affected file and rerun; other uploaded references remain available. Saved cases support previews, downloads, refresh, version history and deletion.

Phase 3 adds measured check times, direct upload/replacement buttons on affected result cards and an owner-scoped Request assisted review action. Pending requests are shown in the local reviewer queue, and reviewer decisions complete them. Repeated pending requests preserve the original request and audit-run count. Findings that compare GST and Udyam business names now appear on the affected document card as well as the overall result. A missing PIN reference directory is shown as informational text without a successful-check mark.

## Private storage and simulated review

Under explicit v3 consent, original bytes, necessary extracted fields, context, current/prior results and reviewer comments are AES-256-GCM encrypted in the local SQLite KYC tables. Operational reference metadata remains local. Raw OCR text and full signatory ID values are not extracted into application fields or logged. Result identifiers are masked. Private originals are available only to their browser owner or an authorized simulated reviewer.

This is payload encryption, not encryption of the entire SQLite database, existing order/contact tables or PostgreSQL chat storage. Cases expire with their owning browser session, up to seven days. Case deletion or conversation deletion removes retained case descendants; immutable order snapshots retain minimal masked findings. Temporary-only mode is explicitly labelled when private storage is not configured.

Extracted `rawText` is used transiently for validation and is excluded from retained extraction fields. The one-time `002_drop_raw_ocr_text_v1` data cleanup in `kyc-store.mjs` removes this duplicate text from earlier encrypted upload payloads transactionally. Original files, previews, necessary fields, IDs and upload versions are preserved.

Authorized reviewers use `/kyc-review.html`, also linked from the sales desk. Use the privately configured `KYC_REVIEWER_TOKEN` from ignored `.env` in its access-code field; do not publish it. Reviewer sessions last one hour. Reviewers can view private files and masked extracted fields, request corrections, reject, or record simulated approval with a comment and timestamp. Deterministic failures such as inactive registrations, known mismatches or outdated proofs cannot be approved around. Decisions issue a new bound verification snapshot; existing orders do not silently change. No real reviewer notification, government authentication or provisioning is connected.

## Verification evidence

Main changed files:

- Reading: `src/pdf.mjs`, `src/ocr.mjs`, `src/kyc-reader.mjs`.
- Validation: `src/kyc.mjs`.
- Private persistence/security: `src/kyc-store.mjs`, `src/store.mjs`, `server.mjs`, `migrations/sqlite/001_smart_kyc.sql`.
- Customer interface: `app.js`, `index.html`, `style.css`.
- Simulated reviewer: `kyc-review.html`, `kyc-review.js`, with a link in `sales.html`.
- Setup and testing: `scripts/setup-kyc.mjs`, `scripts/check-smart-kyc.mjs`, PDF fixture helpers, Smart KYC/security tests, updated existing OCR/PostgreSQL tests, `package.json` commands, environment example and source-packaging allowlist.
- Current documentation and privacy/security/database notes; measured results in `reports/smart-kyc-specimens.md` and `.json`.

No application libraries were added. The implementation reuses Tesseract.js, its installed English model, PDF.js, the existing canvas renderer and built-in Node cryptography/SQLite.

```powershell
npm test
npm run test:postgres
npm run check:smart-kyc
```

The specimen command reads all 47 supplied images and validates all 12 applicants using independently matched supplied lead/registry records. Reports contain fixture IDs, confidence, field presence and finding codes, never raw extracted identifiers or contacts. The 3 November 2026 run found 44 fully extracted, two partial and one failed. All 12 applicant groups require action under the current checks, including Udyam registration-date disagreements with the supplied mock registry. A real K12 extraction regression confirms its extracted date occurs in the OCR text while the registry date does not. Earlier three-pass/eight-action/one-review results described an older set of checks and are superseded. No judges-only answer key was supplied, so these are computed findings, not an answer-key accuracy score. See `reports/smart-kyc-specimens.md` and `.json`.

Phase 3 validation: 108 regular tests passed, with one optional PostgreSQL test skipped in that run and passed separately. A signed-in browser journey used synthetic text PDFs: an outdated proof received a specific correction, an assisted-review request persisted, replacing only the proof produced checks passed, the signatory stayed at version 1, and refresh retained the case. Measured checks took 0.7 seconds initially and 0.1 seconds for the corrected text-PDF run on this computer. These are local observations, not a guaranteed OCR or external verification SLA. The KYC page fit a 375px viewport without horizontal overflow. A separate synthetic test journey named Phase 3 KYC Demo was created for this walkthrough.

Regression tests additionally cover scanned/text PDFs, JPEG OCR, malformed-file isolation, no-registration customers, exact failure codes, consent, owner/reviewer authorization, encrypted restart recovery, expiry, individual replacements, upload history, blocked approval of deterministic failures, explicit field review before checkout, and existing order/session functionality.

Earlier rendered submission PDFs/decks reflect the previous retention design and must be regenerated before being represented as the current Smart KYC implementation.

GSTIN comparison diagnostics can be enabled with `KYC_DEBUG=1`. Both entered and extracted values remain masked, including in development; logs include lengths, equality, differing positions and whether OCR normalization was applied. The reader corrects O/0 confusion only in required numeric slots when the complete candidate passes GSTIN format/checksum, without consulting filenames, customer input or registry candidates. UI and validation share the same normalized extracted field. Rerun checks to refresh prior saved results; unchanged file bytes retain their upload version while their extracted fields are refreshed and previous runs remain in history.
