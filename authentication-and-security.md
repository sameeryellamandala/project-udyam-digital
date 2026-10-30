# Authentication and security

## Prototype access
Anonymous browser session: random 256-bit cookie, HttpOnly, SameSite=Strict, seven-day expiry. Store only its SHA-256 hash in SQLite. Bind verification and orders to session hash; return 404 for other sessions' order IDs. No cross-device recovery or verified identity is claimed. Before production add OTP/OIDC and partner role authorization.

## Request and secret protection
Loopback default, same-origin JSON mutations, no permissive CORS, bounded request/image sizes, bounded AI context and timeouts, basic per-session rate limiting. Serve only approved frontend assets. Keep `.env`, CSVs, database, tests and source archives private. SQL uses bound parameters. Render model/user text escaped. Set CSP and content-type/frame/referrer headers. Enable Secure cookies behind production HTTPS.

## KYC privacy design
Versioned consent before identifiers/documents leave browser. Optional separate consent explains image processing by OpenAI. Local OCR uses the installed English model without uploading images. Raw images exist only in memory for extraction; persist masked findings and consent proof, not image bytes. Seven-day expiry for prototype stored records, plus own-order deletion. No sensitive fields in application logs. SQLite contacts are plain text locally: use a protected device and synthetic data; production encryption/processor/legal review remains outstanding.

## Threats and controls
- Price tampering: server reprices catalogue IDs/quantities.
- Fake verification IDs: ownership/profile checks; stored server result.
- Prompt injection in chat/documents: untrusted input, constrained schema, no authority over prices/order status.
- Upload abuse: type/signature/size validation and no executable/file storage.
- Registry harvesting: no public list endpoint; consent-bound checks return limited masked outcomes.
- Provider outage: review/fallback, never fabricated success.

## Legal scope
These are privacy design choices guided by the case's consent/purpose/minimization requirements, not a certification of DPDP compliance. Obtain current legal guidance before real customer processing.
