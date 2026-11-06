# Implementation plan

## Phase 3 KYC correction and review — 3 November 2026

Added an explicit owner-scoped assisted-review request API and customer action, pending-request visibility in the reviewer queue, measured verification time and direct replacement controls on affected document cards. Fixed cross-document mismatches missing from those cards. Raw OCR text is excluded from new retained extraction fields, with a transactional one-time cleanup for older encrypted upload payloads. Original files and versions are preserved. Raw-text-only reading is classified as failed extraction, and missing PIN-reference information is not presented with a successful-check mark.

Validation: 108 regular tests passed and one optional PostgreSQL case skipped; the separate temporary-database PostgreSQL integration passed. Browser testing covered consent, outdated proof, review request, single-file replacement, unchanged signatory reference/version, corrected checks, refresh restoration and required field acknowledgement. A 375px viewport fit without horizontal overflow. The 47-file rerun produced 44 full extractions, two partial and one failed. All 12 applicant groups have actionable findings under current strict checks, including Udyam date differences from the supplied registry; this supersedes historical pass counts. No supplied fixtures or registry rules were changed to manufacture passing cases. See smart-kyc.md for exact scope and measured times.

Implementation is available locally for customer testing. GitHub publication awaits the user's phase confirmation. Mock registries and simulated staff review continue to be disclosed. The earlier camera-per-branch advisor issue remains separate and unresolved.

## Phase 2 quotation clarity — 3 November 2026

Backend quotes now classify requested services, required supporting products and selected add-ons and calculate separate monthly/setup subtotals. The package page groups the lines and displays each fixed monthly item amount, catalogue range and setup charge, plus the combined monthly total. Existing catalogue eligibility, dependency rules, budget checks and immutable order snapshots continue to apply.

Validation: 105 regular tests passed with one optional PostgreSQL skip; the separate temporary-database PostgreSQL integration passed. New regressions check dependency classification, client classification tampering, add-on removal, quantity pricing, saved-order quote consistency, unchanged earlier snapshots and budget rejection. Signed-in browser checks added email, changed its quantity and removed it, observing +125, +250 and restoration of the original monthly total. A 375px viewport check showed no horizontal overflow. The server was restarted with the updated source.

Remaining discovery issue observed during browser checking: a previously saved conversation requesting four cameras at each of two branches has four cameras recorded in total. This requires a separate advisor parsing correction and regression before full journey signoff. No live provisioning or provider tariff confirmation was added in this phase.

## Project layout — 1 November 2026
Web assets now live in `public/`, project documents in `docs/`, and original case material/source archives in `reference/`. Backend modules, tests, migrations and scripts remain separate. Root startup commands and browser URLs are unchanged. `.env`, private databases and the supplied extracted dataset were not moved or modified. Updated the static allowlist, imports, packaging paths and documentation links. Validation: 78 tests pass, all ten web routes return 200, local documentation links resolve, and all 52 dataset files match the preserved original ZIP. Historical paths in earlier entries describe their original locations.

## Mandatory sign-in — 1 November 2026
Removed guest access from the running customer journey. Clerk sign-in/sign-up renders before the customer shell; setup initializes only after verified authentication. Backend guards require identity for setup, chat, KYC and order routes, with no browser/URL bypass. Missing Clerk configuration fails closed. Staff authentication stays independent, and old guest records remain eligible for explicit account linking. New auth regression verifies unsigned requests return 401 and signed checkout succeeds.

## Clerk customer accounts — 1 November 2026
Added official Clerk JavaScript UI (Google/email according to the configured application) and `@clerk/backend` session verification. API ownership uses a stable hash of the verified issuer and user ID; guest demo mode remains available. Only the publishable key is returned to the browser. Server verification checks signature, expiry, issuer and authorized party; invalid bearer tokens fail closed. Expired incidental cookies never grant account access or prevent a guest opening sign-in. Customer sign-out clears the active chat selection and reloads account-scoped data.

Explicit guest linking requires a valid account token and the original browser cookie. PostgreSQL chat ownership and SQLite orders/KYC/support ownership transfer without changing record IDs. Linking is retry-safe; duplicate request-key collisions preserve both orders. No matching by customer/business name or typed email, and no recovery of older unowned browser records. Account orders/chats have seven-day inactivity retention; KYC cases have an independent absolute seven-day file-retention cap. Staff authorization remains separate.

Validation: 77 regular tests pass; real PostgreSQL suite additionally covers guest/account ownership transfer, duplicate creation keys and isolation. Live Clerk backend/frontend JWKS endpoints return 200 and have matching signing keys. The user completed real sign-in; the backend accepted authenticated account order-list and guest-link requests. This account currently had no orders and no older order was recoverable from its current guest cookie; no unrelated owner's records were reassigned. No credentials or OTPs were requested. Package scan now detects Clerk secret-key patterns, and ignored `.env` holds real credentials. Existing rendered submission artifacts require updating for this feature.

## Staff-to-customer replies — 1 November 2026
Added authenticated sales support replies with Replied/Resolved status, append-only message histories and customer tracker rendering. Existing reviewer decisions now surface owner-scoped customer messages and a correction link in the tracker. Customers reopen the original retained case, replace individual files, rerun checks and submit reviewed passed evidence back to the same order; quote and original verification snapshots remain preserved with a correction audit. Corrections/rejections block fulfillment, including after KYC case deletion. Removed the customer sales-desk link and protected sales APIs using existing local staff/reviewer sessions; production role separation remains future work. No external messages or real provisioning are connected.

Validation: 74 regular tests and separate PostgreSQL integration pass. New regression covers unauthorized staff actions, wrong-owner order reads, masked replies, histories/statuses, correction notification, failed/stale check rejection, field acknowledgement, same-order/same-price successful resubmission, retry idempotency and hold persistence after case deletion. Isolated no-key browser walkthrough verified sales sign-in/reply → customer tracker, reviewer correction → file replacement → recheck → existing order restored. Test data were isolated; existing customer orders and original datasets were retained.

## Order of work
1. Documentation: requirements, design, technical contracts and operational guides.
2. Foundation: Node server, static allowlist, CSV loader, SQLite sessions and environment template.
3. Recommendation milestone: profile normalization, eligibility/dependencies, budget-aware catalogue recommendation, editable/repriced quote.
4. Advisor: structured English/Hindi model conversation; show a retry notice when live AI is unavailable. Keep personal IDs out of advisor prompts.
5. Verification: prior consent, GST checksum/mock lookups, optional image extraction, fixed-date document checks and review-required cases.
6. Orders: session-owned verification, retry-safe checkout, immutable quote and refreshable tracker; no fake provisioning.
7. QA: deterministic rules, invalid inputs, unauthorized access, refresh, provider failure, responsive screens.
8. Submission preparation: aggregate leads analysis, business case, privacy note and demo recording. These final presentation/video artifacts are separate future deliverables.

## Completion tracking
- [x] Initial prototype inspected and documentation set prepared.
- [x] Backend and source data loading.
- [x] Catalogue-based recommendations and quote editing.
- [x] AI adapter and clear unavailable notice (Groq live testing connected).
- [x] Consent, registry checks and extraction adapter (local OCR tested; optional external reading disabled for Groq).
- [x] Saved orders and protected tracker.
- [x] Automated tests and local walkthrough of the no-key review journey.
- [x] Local English OCR with per-document feedback and signatory expiry checks.
- [x] Useful English/Hindi rule-based guided conversation without an API key.
- [x] Need-coverage-aware package selection, full-team email quantities and service explanations.
- [x] Aggregate lead report, business-case content, privacy-note content and demo script.
- [x] Groq advisor tested live in English and Hindi. Local OCR tested across supplied images.
- [x] English/Hindi customer controls, descriptions and common errors; browser/keyboard/mobile review.
- [x] Ten-slide deck, one-page privacy note and standalone architecture PDF.
- [x] Final narrated demo video (155.62 seconds) and submission packaging validation.

## Dependencies and choices
Groq is the selected testing provider (`AI_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-120b`). A private key has been configured locally and is excluded from source delivery. A later paid GPT choice requires explicit provider settings and evaluation. Local OCR needs no AI key. No fine-tuning, government integration or MCP server is required. Deployment is separate from local development.

## Advisor rate limits and structured-response recovery — 2 November 2026

Inspected the Groq adapter, LangGraph call sequence, PostgreSQL chat transaction, schema parser and chat retry UI. The app already limited each browser owner to six advisor turns per minute, retained only the latest ten persisted messages for a turn, and used strict JSON schema plus local validation. It had no provider-call concurrency bound or 429 retry; its JSON-mode retry did not include validation errors; and a saved unavailable response was permanently returned for the same idempotency key. Added a two-call process-local queue; bounded retries for 429 and transient 5xx with jitter and `Retry-After`; safe JSON request/usage/rate-limit telemetry; field-level schema correction; friendly rate-limit, invalid-response, timeout and network messages; and same-key retry behavior that updates the stored assistant reply without duplicating the customer message or changing requirement memory. No model/provider or frontend framework was changed. Exact Groq organization limits remain account-specific and must be checked in its Console; this code does not claim to remove provider quota limits.

Verification: provider tests simulate 429, 503-then-success, concurrent requests, malformed JSON, missing fields, incorrect types and correction. The PostgreSQL integration test confirms the same request key retries a failed turn without another user message and returns the eventual successful reply on duplicate delivery. Latest result: 94 regular tests pass, one PostgreSQL test is skipped in the regular suite; the separate PostgreSQL integration passes. Live provider evaluation was not run because account usage/rate limits cannot be inferred from mocked tests.

## First acceptance milestone
A clinic and a retailer with different needs receive different eligible packages sourced from CSV; changing quantities updates server totals; a too-small budget is explicitly surfaced.

## First milestone verification evidence
The initial 11 Node tests passed. They cover CSV parsing, synthetic GST checksums, eligibility, dependencies/pricing, budgets, consent, document dates, input validation, advisor identifier redaction, SQLite persistence, retry-safe checkout and HTTP session isolation. Browser walkthrough: clinic -> catalogue quote -> contact -> consent -> missing-document review -> saved order -> page refresh. Mobile tracker checked at 375px with no horizontal page overflow. Key customer copy has English/Hindi variants, but catalogue descriptions and some operational labels remain English; full localization is outstanding.

No API key was supplied and no live provider calls were made during this milestone. Local OCR now reads the supplied English form layouts on this computer; actual sample tests confirm matching fields and a cancelled GST review outcome. Rotated or unfamiliar scans may require review. External AI reading remains behind a separate opt-in and still needs live evaluation. The assisted-review status is saved locally; no real partner team is notified.

## Second implementation milestone
The regression suite now contains 17 tests, including real-image OCR and aggregate-data consistency. The browser walkthrough confirms guided chat updates an eight-person clinic's needs/budget, produces a Rs 1,999 catalogue package, and shows local-reading results from an uploaded fictional address proof. Setup guides now include `npm ci` for the installed OCR model. Business evidence lives in `reports/lead-analysis.md`; `business-case.md`, `privacy-note.md` and `demo-script.md` are reviewable content sources, not a rendered final deck/video/PDF.

Second-milestone responsive review: package screen inspected at 1280px and 375px; no horizontal page overflow at mobile width. Browser upload confirmed local-reader choice and document-specific review feedback.

## Final implementation evidence
The suite now has 24 passing tests, including provider selection/fallback, INR guards and segment/tier/budget combinations. All 47 images were checked locally (44 readable, three require review). Browser checks cover live Groq, language round-trip, explicit quantity updates, checkout repricing, consent, local OCR, review orders and refresh. Final file checks are recorded in `reports/final-qa.md`. The 22/17/11 counts above describe earlier milestones.

## Completed prototype deliverables
See `output/submission/` for the ten-slide PPTX, one-page privacy PDF, architecture PDF, narrated demo and source ZIP. Groq is configured locally and tested. The final paid model remains undecided. Public hosting, real telecom provisioning and publishing a remote Git repository remain outside this local prototype delivery.

## Local advisor provider — 31 October 2026
Added explicit Ollama support using local schema-constrained chat with qwen3.5:4b, thinking disabled and no cloud fallback. Local configuration now selects Ollama. Greeting completed successfully on CPU in about 120 seconds including the initial load; latency remains a demo limitation. Existing local OCR continues independently. The 26-test regression suite passes including local transport/schema checks.

## Groq advisor functional guide — 31 October 2026
User selected Groq again. Added requirement memory, separate backend bundle validation, relevant catalogue retrieval, range comparisons and explicit quote handoff. Removed the fixed 5G answer labelled as live AI. Added safe provider diagnostics and one bounded schema-recovery retry. A new key still encountered Groq token limits during live evaluation; it does not provide unlimited usage. See `reports/advisor-guide-live-review.json` for actual fictional example outcomes.

## Advisor reply clarity examples — 31 October 2026
Added explicit acknowledgement/summary/options/conditions/question instructions and backend formatting of catalogue facts. Unknown defaults and quantities are withheld from generation. Standalone failover, named SD-WAN requests, explicit employee/SIM counts, postpaid preference, outage guarantees, absent products and unavailable tax rules are handled explicitly. Latest expanded review: 13/13 live example assertions after reruns, 40 automated regressions. Groq quota and occasional structured-response failures remain documented.

## Advisor dependency warning fix — 31 October 2026
Optional comparison failures no longer invalidate the primary package. A valid fibre-plus-backup bundle can be explained and greetings are handled without repeating a comparison warning. All 41 automated tests pass, including the reported two-site scenario. Live provider availability remains quota-dependent.

The follow-up regression reproduced a saved 5G preference with backup. General advice now uses a backend-valid alternative while preserving the preference; an explicit incompatible 5G request still receives a dependency explanation. All 42 automated tests pass. Provider calls remain subject to quota.

## Conversational advisor questions — 31 October 2026
Separated general questions, explanations, comparisons and hypothetical service scenarios from requirement changes and quotation confirmation. Questions preserve saved selections and can discuss any supplied catalogue service. All 45 tests pass, including no-selection, unrelated-selection and price-guard regressions. Live evaluation reached the question path but encountered an unsupported price (now covered by bounded same-topic repair); the subsequent request reached Groq rate limits. End-to-end live validation of this change remains provider-dependent.


## PostgreSQL sessions and requirement memory — 31 October 2026

Implemented with the user's approved Node.js backend approach. PostgreSQL is configured locally in a dedicated Docker container with persistent storage; secrets stay in ignored files. Applied checksum-tracked transactional migration 001. New same-origin session APIs support create/list/load/history/requirements/chat/delete with browser-owner isolation. Messages and JSONB requirements are stored separately, with chronological pagination, last-10-message context, per-conversation locking and idempotent request IDs. A new chat does not import form defaults or another chat's requirements. Explicit additions/removals, additive SIM counts, budget clearing and ambiguous changes have regression coverage. The existing provider, catalogue engine, KYC/order store and single-summary compatibility endpoint remain available.

UI: floating advisor now has New chat, a dated history list with previews and active status, resume, older messages and chat deletion. Chat requirements transfer to the checkout form only when the customer reviews a package. Local guided conversations remain explicitly labelled when no key is configured.

Validation: 49 non-database rule/API/OCR/memory tests pass; the real PostgreSQL integration suite passes separately against a newly created temporary test database. It covers migrations, restart recovery, independent sessions, ownership, concurrent increments, retries, history, deletion and expiration. Browser live Groq: internet for five employees followed by three postpaid SIMs retained exactly internet, five employees and three SIMs; no unrelated form services or two-location value were imported. Created a second empty chat, reopened the first, and observed restored messages and requirements. Existing Groq quotas/availability still apply.

Limitations: ownership is the existing seven-day browser cookie, not customer-account authentication or cross-device recovery. Historical SQLite summaries are preserved; no unavailable transcript is invented or imported. English/Hindi existing interface remains; some new conversation administration labels and guided replies are English. PostgreSQL/Docker must be running for saved multi-chat operation. Account login, long-term customer profile and native PostgreSQL migration of KYC/orders are not part of this implementation.

## Social-turn handling — 31 October 2026
Standalone thanks, greetings and farewells now take precedence over unfinished discovery, preserve session requirements and do not confirm or change a package. Mixed social text plus a real request continues through normal understanding. Regression tests cover the supplied closing message and greeting in both live-configured and guided session paths.


## Unified form/package/chat session — 31 October 2026

Completed the approved incremental upgrade. Added migration 002 for owner-scoped creation retry keys and requirement revisions, applied to local PostgreSQL without replacing data. Form submit creates/reuses the active session and confirms submitted requirements. Advisor, form and package read/update the same canonical state; opening the advisor and navigating back reload saved history and requirements. `Review package` now only chooses an offered quote, rather than being the only requirement transfer. The URL preserves the session ID and form/package view. New chat and another setup are explicit independent journeys.

Added canonical recommendation/form APIs, stale form/version protection, retry-safe form mutations, persisted explicit quote selections separate from requested services, and journey/revision binding for KYC/order snapshots. Missing/null extraction fields do not overwrite confirmed form fields; explicit removals clear requested services and obsolete selections. Legacy no-session APIs remain compatible.

Verification: 54 regular rule/API/OCR/memory tests pass; real PostgreSQL integration passes separately in a temporary database. New cases cover form-seeded memory, the exact CCTV removal/₹7,000 example, preserved SIM counts, duplicate creation, duplicate form save, stale forms, conflicting client profiles, wrong-owner access, selected-quantity persistence and invalidation, and cross-journey verification rejection. Live browser Groq walkthrough submitted a synthetic retail form (five employees, two sites, ₹5,000 and six requested services), removed CCTV and raised budget to ₹7,000 in chat, observed package changes without Review package, then returned to the form and confirmed five employees, two sites, unchanged remaining services and the updated budget under the same session ID. Groq quota/availability and browser-cookie ownership limitations remain unchanged.

Final shared-journey browser check also confirmed refresh restores the same form/session, package navigation works without resubmitting the form, and the form fits at 375px. Checkbox values are compared in canonical order so merely opening the advisor or navigating does not invalidate a saved package.

## Smart KYC upgrade — 31 October 2026

Completed automatic independent document extraction, backend validation, correction, private previews, encrypted retention and separately authorized simulated review. Reproduced the PDF pixel-boundary failure with a supplied specimen converted to PDF: ceiling-rounded dimensions exceeded the cap, and the old catch converted every upload to a generic failure. Fixed the size calculation, made limits per document, isolated failures and retained safe PDF/OCR reason codes. Usable PDF text is read directly; scanned PDFs/images use local English OCR with confidence where available.

Numbers are extracted before actual supplied GST/Udyam lookups. Checks accept synthetic PAN X/district 00, compare identifiers/status/names/addresses and cross-document evidence, enforce 90-day address age and available ID expiry at 15 July 2026, and distinguish uncertain spelling from known mismatches. Unregistered customers can pass required evidence for unrestricted products. Findings include corrective actions; simulated review is a fallback.

Added checksum-tracked SQLite KYC migration 001, original-file UUID references, encrypted original bytes/necessary fields/context/current/prior results and reviewer comments, upload history, owner-only access/deletion and short-lived reviewer authorization. Deterministic errors block approval. Verification binds to profile/contact/journey/revision and requires explicit field-review acknowledgement. Masked-ID resume does not reveal full registration numbers. V3 consent is required for retained processing; earlier unretained originals cannot be reconstructed. Existing orders stay immutable.

Evidence: 61 regular tests pass; the optional PostgreSQL integration suite passes separately in a temporary database. All 47 specimens were read and all 12 applicants independently matched to supplied lead records: 44 full extractions, two partial and one failed; applicant outcomes were two checks passed, nine action required and one manual review. No judges-only answer key was supplied or accessed. Reports contain fixture identifiers and finding codes, not raw extracted IDs/contacts. Tests additionally cover PDF/JPEG formats, malformed-file isolation, missing/unregistered/mismatched/expired fields, no-registration customers, encryption/restart/expiry, owner/reviewer security, replacements and checkout.

No-key browser walkthrough: two PDF proofs without GST/Udyam received automatic Checks passed, registration certificates were correctly not required, a private preview opened, field acknowledgement was accepted, and the saved order reached the tracker without simulated activation. Existing styling and journey were preserved. See smart-kyc.md. Earlier rendered submission PDFs/decks describe the prior retention design and need regeneration before use as current documentation. Real government authentication, reviewer notifications and production account infrastructure remain out of scope.

## GSTIN comparison and K03 regression — 31 October 2026
Traced the actual K03 OCR result: a printed zero was read as O in a required numeric GSTIN position. Added shared uppercase/trim normalization and checksum-guarded numeric-slot OCR cleanup independent of customer input, registry guesses or filenames. Validator comparisons, private fields and masked displays now use the same normalized extracted value. Genuine number/name mismatches and registry status checks remain tested. Opt-in KYC_DEBUG diagnostics mask all values even in production. Rechecking unchanged original bytes refreshes stored extraction without incrementing file version; prior check history remains. All 64 regular regressions plus PostgreSQL integration pass. Full 47-file rerun now reports K03 checks passed; applicant totals are three passed, eight action required and one manual review, with no judges-only answer-key claim.
# K06 trade-name validation correction

- When no registry record is available, an exact certificate trade-name match now prevents a false proprietor/legal-name mismatch. Available registry legal/trade-name checks remain independent.
- GST registration dates exclude following table-row text. Invalid extracted GSTINs remain flagged; no registry-based identifier replacement is performed.
- Added actual K06 OCR and independent registry-name regression coverage. Validation: 66 tests passed, one optional PostgreSQL test skipped in the regular suite.


## Sales help-request messages
Customer help requests now include escaped, contact/registration-redacted message text in the existing local sales queue. Existing saved requests are available without resubmission. No external notifications are sent.

## Application completion — 1 November 2026

Saved-order navigation follow-up: fixed boot restoration skipping orders whenever a PostgreSQL chat was active. Owner-scoped order summaries expose their stored journey ID; restoration selects the matching journey order or explicit owned order ID, never an unrelated latest order. A persistent My orders header opens all saved browser-owned orders from any step. Tracker URLs preserve order_id; opening history loads its corresponding conversation. Explicit fresh-form URLs without a journey stay on the form. Legacy snapshots remain readable. Browser verified the existing saved order, sales-desk return, refresh, history access from the first step and 375px layout. 73 regular tests plus the separate PostgreSQL integration pass. No order/customer data was deleted or recreated.
Closed the agreed application gaps independently of submission materials. Added backend-derived fixed demo monthly quote policy without changing catalogue prices or old saved-order snapshots. Completed current customer KYC/quote/help/privacy labels in Hindi, preserved canonical support option values, excluded customer values from localization, and extended Hindi/Devanagari requirement parsing in saved conversations. Added quote persistence/client-price rejection and Hindi parsing regressions.

Validation: 70 regular tests pass, optional PostgreSQL case skipped in that run and separately passed against a temporary database. Live English/Hindi explicit-requirement checks passed; unrelated-selection general question passed on a separate retry after a provider rate limit. No-key browser walkthrough: fixed quote, quantity repricing, consented PDF checks, field acknowledgement, saved tracker, refresh persistence, Hindi help request and English round-trip. Quote/tracker fit 375px with no horizontal page overflow. Existing local PostgreSQL container was restarted; application reports PostgreSQL conversation storage and encrypted local KYC. See reports/application-completion-review.md for scope and production exclusions.

## Advisor workflow and catalogue tools — 2 November 2026

Added LangGraph.js as a single-pass per-turn coordinator with explicit context retrieval, structured requirement extraction, merge/catalogue validation and response finalization nodes. PostgreSQL continues to own durable messages and structured requirements. The graph intentionally has no autonomous tool loop. `advisor-tools.mjs` provides catalogue search/details, eligibility, dependencies, recommendation, backend quote calculation, budget comparison and explicit “provider confirmation required” location status; the recommendation flow uses these tools for authoritative pricing and validation. Added support for additive location updates while retaining absolute “change to N locations” semantics, and owner/journey-scoped, privacy-minimized KYC/order context for advisor questions. Missing model fields cannot overwrite saved profile facts. No raw conversation text, contacts, government identifiers, private files or order IDs enter the order/KYC context. Existing quote/KYC/order operations still use their deterministic APIs.

Validation: 90 regular tests pass and one optional PostgreSQL case is skipped in that suite; the separately run PostgreSQL integration passes. Synthetic live Groq checks passed both English and Hindi requirement extraction, but the unrelated-selection question was rate-limited (HTTP 429) and returned a safe unavailable response; live general-question behavior therefore remains unverified in this run. Deterministic tests cover that question behavior independently. Live model checks remain quota/provider dependent and are not represented as deterministic test evidence.

## CCTV quantity and named-location retention — 2 November 2026

Advisor and guided session memory now retain explicit camera totals and per-named-location camera counts. “Add more cameras” increments the relevant saved total or location; a newly stated total replaces the prior total. Adding or removing services preserves the other confirmed requirements. A complete CCTV recommendation now waits for a camera quantity instead of silently pricing one assumed camera. The backend uses the supplied per-camera catalogue price and existing catalogue eligibility/dependency checks. Customer form and chat continue to share the same journey state; form changes that remove CCTV clear its dependent camera counts.

Validation: full suite 101 passed, 0 failed, 1 optional PostgreSQL test skipped; the separate temporary-database PostgreSQL integration passed. The document check read all 47 supplied images (44 readable, 2 partial, 1 needing a clearer image); Smart KYC processed all 47 (3 checks passed, 8 action required, 1 manual review, based on 12 synthetic applicants). City-tier inference remains limited to stated tiers because the synthetic leads do not include a Vijayawada record; no city tier or street availability is invented.


## Mixed city-tier locations — 3 November 2026
Implemented separate location tiers and camera counts in the current form, persistent advisor memory and authoritative catalogue quoting. Branch edits preserve other location facts and requested shared services. Package lines, controls and subtotals carry stable location IDs. Branch-ineligible products and dependencies fulfilled only at another branch are rejected. Shared SIMs are not multiplied by site count. Existing single-tier aggregate profiles continue to work.

Validation: regular suite 115 passed, 0 failed, 1 optional PostgreSQL test skipped; separate temporary-database PostgreSQL test passed including mixed-tier state/selection reload and ownership. Browser test created a synthetic two-location Tier 1/Tier 2 journey with two/one cameras: combined monthly ₹2,595, setup ₹5,400, matching catalogue prices. Reload preserved the quote; 375px mobile layout had no horizontal overflow. These checks do not establish live provider availability or multi-address KYC coverage. Await customer confirmation before pushing this work.


## Location UI simplification — 4 November 2026
Supersedes the mixed-tier form rollout above: removed location count and branch editor by customer request. One city tier, one site per submitted form, and one camera total restore the simpler checkout. Historical quote rendering and backend location support remain for existing records; no user data is deleted. GitHub publication still awaits confirmation.


## OCR reliability update — 6 November 2026
Identifier rows are bounded to avoid swallowing neighbouring fields. Local reading retries incomplete/invalid extraction using in-memory contrast preparation and automatic rotation, followed by a bounded GSTIN-region reading where a label is found. Position-constrained ambiguous-character corrections require a unique checksum-valid result; no registry/profile values select a repair. Unresolved local GST readings generate a review finding and cannot grant GST eligibility. Independent mock-registry, business-name and date checks remain.
Validation: 20 focused OCR/KYC/security tests passed, including actual K02/K03/K07/K08 scans and uncertain-reading escalation. All 47 supplied images processed; parser readability improved from 44 to 45 before the final region retry. This is readability coverage, not a manually annotated field-accuracy benchmark. Remaining work: independent per-field transcription annotations for the complete pack and browser visual review of the uncertainty message. No production accuracy guarantee or government verification is implied.

Final regression: npm test completed with 128 passed, 0 failed, 1 optional PostgreSQL test skipped (129 total). Final 47-image run: 45 readable, 2 needing review; 6 contain registry/date/readability review signals. The K06 trade-name regression now expects uncertain scan review rather than asserting the document itself has invalid format. Existing running servers must restart to load the backend changes.
