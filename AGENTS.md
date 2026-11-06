# Project instructions for coding agents

- Read `docs/PRD.md`, `docs/architecture.md` and `docs/implementation-plan.md` before changing behavior.
- Keep supplied datasets/source archives intact. Use 2026-07-15 for KYC document-age checks; actual timestamps for sessions/orders.
- Use catalogue data, never invented products/prices. Validate eligibility/dependencies/quantities and reprice on the backend.
- AI proposes conversational content; deterministic checks own eligibility, prices, consent and order state. No fine-tuning is required.
- Never label a guided fallback as live AI or a selected file as verified. No invented installation progress.
- Keep secrets in ignored `.env`. Never print keys, raw government IDs, document contents or customer contacts. Escape all user/model text.
- `npm ci` installs locked dependencies, including the local English OCR model. `npm start` runs the app. `npm test` runs meaningful rule/API/OCR tests; use temporary test databases, never delete user data to make tests pass. `npm run analyze` regenerates aggregate lead evidence only.
- Add no dependencies unless they solve a real need. Node.js >=24 is required for built-in SQLite.
- Keep doc status accurate. Clearly distinguish completed functionality, provider-dependent paths and future work.
- Check responsive UI and the no-key path. Changes to KYC/order security need regression tests.
- MCP is optional; do not add credentials, real messaging, billing or provisioning integrations without an actual requirement.
