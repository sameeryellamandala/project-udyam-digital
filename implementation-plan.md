# Implementation plan

## Order of work
1. Documentation: requirements, design, technical contracts and operational guides.
2. Foundation: Node server, static allowlist, CSV loader, SQLite sessions and environment template.
3. Recommendation milestone: profile normalization, eligibility/dependencies, budget-aware catalogue recommendation, editable/repriced quote.
4. Advisor: structured English/Hindi model conversation with a labelled no-key fallback. Keep personal IDs out of advisor prompts.
5. Verification: prior consent, GST checksum/mock lookups, optional image extraction, fixed-date document checks and review-required cases.
6. Orders: session-owned verification, retry-safe checkout, immutable quote and refreshable tracker; no fake provisioning.
7. QA: deterministic rules, invalid inputs, unauthorized access, refresh, provider failure, responsive screens.
8. Submission preparation: aggregate leads analysis, business case, privacy note and demo recording. These final presentation/video artifacts are separate future deliverables.

## Completion tracking
- [x] Initial prototype inspected and documentation set prepared.
- [x] Backend and source data loading.
- [x] Catalogue-based recommendations and quote editing.
- [x] AI adapter and guided fallback (Groq live testing connected).
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
