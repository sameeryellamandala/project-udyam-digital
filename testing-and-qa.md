# Testing and QA

## Automated gates
Run `npm test` with isolated temporary databases and no network/provider spending.

| Area | Essential cases |
|---|---|
| CSV | Quoted commas, escaped quotes, 25 products loaded |
| Eligibility | Tier restriction, minimum staff/sites, active GST, synthetic X checksum |
| Quotes | Setup vs monthly, quantity bounds, duplicates, missing prerequisites, unknown IDs, client-price tampering |
| Recommendations | Clinic vs retail needs, budget too low, no implicit GST unlocking |
| KYC | Missing consent/docs, unknown/inactive registrations, mismatched names/address, stale/future proof at fixed date |
| Orders | Stable ID, retry idempotency, profile-bound checks, other-session denial, restart persistence |
| Security | Static allowlist, wrong origin, size limits, masked responses |

## Manual acceptance
Use the browser on desktop and 375px mobile. Complete profile -> quote edits -> consent -> KYC -> order -> refresh. Navigate back without losing details. Check keyboard focus and announced errors. Try no key, provider failure, budget warning and incomplete documents. Check model replies cannot introduce unpriced checkout products. Do not log personal fields while debugging.

## Provider evaluation (requires configured key)
Run representative scenarios across four segments, two tiers, limited budgets and English/Hindi. Evaluate relevance, no invented products/prices, missing-question handling and refusal recovery. Compare extracted fields against supplied images. Record failures and adjust prompt/validation; do not assume fine-tuning is needed. Automated tests may mock the provider but cannot establish live model quality.

## Release evidence
Record command results and limitations in `implementation-plan.md`. Video/deck require the submission checklist and truthful disclosure of mock registries and simulated fulfillment.

## Local OCR regression coverage
Tests read actual supplied K01 images without network calls, match extracted fields, and confirm that the cancelled GST registry still forces review. Other checks cover full-team quantities, budget coverage, required connectivity dependencies, English/Hindi guided changes, expired signatory IDs, bounded image dimensions and external-processing consent.

## Final result
The 24-test suite passes. All 47 images have a local readability/review report. Latest English/Hindi live Groq checks and the browser journey are recorded in `reports/final-qa.md`. Public launch/real service integrations are not covered by these prototype checks.
