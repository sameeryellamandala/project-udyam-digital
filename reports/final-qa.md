# Final prototype QA and submission evidence

Checked on 30 October 2026. All business/customer inputs used for checks were fictional. No judge-only pack was accessed.

## Automated checks
- `npm test`: **24 tests passed**. Coverage includes CSV/GST checks, eligibility/dependencies, pricing/quantities/budgets, signatory expiry, local image reading, consent, storage ownership/restart, retry-safe orders, provider selection, INR output guards, schema validation/retry, Hindi messages and the segment/tier/budget matrix.
- Source code syntax checks pass. Tests use isolated databases and mocked providers unless explicitly running the separate live check script.

## Live Groq
`AI_PROVIDER=groq`, testing model `openai/gpt-oss-120b`. Latest separate English and Hindi synthetic checks returned live-AI mode and valid profiles. English was also verified in the browser with actual catalogue prices. Some strict-decoder Hindi generations returned `json_validate_failed`; the adapter now retries once on the same provider in JSON mode, validates the full schema locally, and otherwise uses labelled guided mode. Quotas/outages still apply. There is no automatic paid OpenAI fallback.

## Documents
All **47** supplied images were processed locally. **44** met the parser's readability requirements and **3** require a clearer image/manual review. Eleven images showed at least one readability/registry/date review signal. These counts are limited extraction checks, not applicant approval rates or document-authenticity scores. `document-pack-qa.md` lists the fixture results without raw identifiers or OCR text.

## Browser walkthrough
Live advice for an eight-person clinic with Rs 2,100 budget; a Rs 1,999 eligible package; English/Hindi round-trip; Hindi service descriptions, quantities and common review errors; explicit quantity update from eight email accounts to seven (Rs 1,874); checkout repricing back to eight (Rs 1,999); consent/local-reader controls; actual image upload; per-document review; session-owned saved order; refresh persistence; privacy dialog. Earlier desktop/mobile checks covered 1280px and 375px widths without horizontal page overflow.

## Submission files
- Ten-slide PowerPoint using the supplied template artwork, with three native tables and one native chart. Slides were rendered and inspected; internal Office relationships validate.
- Privacy/security PDF: exactly one page, rendered and inspected.
- Architecture PDF: exactly one page, rendered and inspected.
- Narrated app-screen video: **155.62 seconds**, H.264/AAC, with local synthesized narration and actual captured app screens. Audio stream and non-silent volume checked; preview inspected. This is a narrated screen walkthrough, not an uninterrupted live screen recording.
- Source archive: allowlisted application, tests, documentation and supplied fictional fixtures. `.env`, local orders, dependencies and temporary captures are excluded. Source credentials are scanned before packaging.

## Limits before public deployment
No verified customer login, public hosting, real government API, payment collection, installation provisioning or partner notifications. Local SQLite is not encrypted at rest. OCR is conservative and expects supplied English layouts; unclear/rotated documents need review. English/Hindi product names retain canonical catalogue branding. Further user testing is appropriate before production. The final paid model is intentionally undecided, as requested.

The source repository remains local. Publishing a remote repository or deploying the app is a separate action.
