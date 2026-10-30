# Hackathon submission checklist

## Required
- [x] Working local prototype, local Git repository and source archive with startup instructions. No remote repository has been published.
- [x] Demo video <=3 minutes: discovery, rationale, price edit, consent, document issue, saved order and tracker.
- [x] Architecture diagram with components and data flows (`architecture.md` is the technical source).
- [x] Business case <=10 slides: target segment evidence, customer pain, bundle/pricing, journey, acquisition/partner role, rollout, costs, 3-5 success metrics, risks.
- [x] One-page privacy/security note: purpose, consent, minimization, masking, retention/deletion, external processing and deployment limits.

## Evidence and honesty
- [x] Aggregate provided leads to justify target segments and baseline metrics; do not invent experimental improvements. See `reports/lead-analysis.md`.
- [x] Use only synthetic data. No judge-only answer keys or private test pack.
- [x] Identify guided vs live AI, mock registries, manual-review cases and unconnected provisioning.
- [x] Check no credentials, generated database or private session data in repository/video.
- [x] Live Groq advice verified with the configured key; local OCR verified. External AI image reading is deliberately not claimed.
- [x] Mobile and English/Hindi experience reviewed.

Submission outputs are in `output/submission/`: `udyam-business-case.pptx` (10 slides), `privacy-security-note.pdf` (1 page), `solution-architecture.pdf`, `udyam-demo.mp4` (155.62 seconds), subtitles and `udyam-source.zip`. The video is a narrated walkthrough of actual app screens. See `reports/final-qa.md` and `reports/submission-validation.json`. Public repository publication and deployment are separate steps.
