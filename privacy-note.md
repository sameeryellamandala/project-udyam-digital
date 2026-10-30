# Udyam Digital: privacy and security design note

This hackathon prototype processes fictional businesses and documents. Its design follows the case's consent, limited-purpose and data-minimization requirements; it is not a legal compliance certification.

**Purpose and collection.** Business type, size, location tier, tools, needs and budget support package recommendations. Contact name, phone and installation address are requested at checkout. GST/Udyam identifiers and document images are requested only in the consent step. No full registry export is exposed to the browser.

**Consent and document reading.** Verification requires an explicit, versioned consent with timestamp. The default reader uses Tesseract locally with an installed English language model. Images stay on the local server and are processed in memory. Users may instead request manual review. Sending images to OpenAI requires a separate opt-in and a configured API key. External provider retention/data policies must be reviewed before real use; `store:false` is not a promise of zero retention.

**Advisor context.** Live advisor conversations send minimized business context and chat to the explicitly selected provider (Groq during testing) when configured. The UI asks customers to avoid private identifiers in chat; common phone, email and registration patterns are redacted server-side. This is not a guarantee that arbitrary free text contains no personal data. Guided mode makes no model calls.

**Storage and access.** Raw document images, OCR text and full extracted signatory IDs are not persisted or logged. Saved orders contain contacts, quote snapshots, masked identifiers and validation findings. SQLite uses a hash of an HttpOnly/SameSite browser-session cookie to restrict access. Records expire with that session after seven days and cleanup occurs on requests/startup; customers can delete their saved orders earlier. Local SQLite is not encrypted at rest and browser sessions do not verify a person's legal identity.

**Safeguards and production gaps.** Server-side repricing, consent checks, profile/contact binding, prepared SQL, request/image bounds, same-origin checks and a static-file allowlist protect the prototype. Failed or unclear checks require review. Before public use add verified login, HTTPS/Secure cookies, encrypted storage, processor contracts, reviewed retention, durable auditing, backups, abuse controls and monitored deployment. Real government validation and provisioning are not connected.
