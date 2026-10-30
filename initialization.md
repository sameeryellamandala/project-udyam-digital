# Setup and initialization

## Files and responsibilities
Root: web assets, `server.mjs`, package/env config and project documents. `src/`: catalogue, AI, verification, storage modules. `tests/`: isolated Node tests. `var/`: generated SQLite database (ignored). Supplied data stays in its original directory.

## Startup sequence
1. Load optional `.env`; validate port/host settings.
2. Parse catalogue and registry CSVs with quoted-field handling.
3. Normalize numeric prices/rules and create registry indexes.
4. Create database folder/tables, enable foreign keys and clean expired records.
5. Listen on loopback and report only URL and AI configured/unconfigured state.
6. Browser initializes an HttpOnly anonymous session, loads catalogue and session-owned orders.

## Bootstrap behavior
Do not import the 5,000 leads into customer accounts. Do not automatically upload any supplied KYC image to an external service. No seed order or fake verification success. A missing/corrupt source file should stop startup with a useful file-level error, without printing its records.

## State reset
Use tracker deletion for own test orders. Tests use isolated temporary storage. To deliberately reset all local development data, stop the server and move `var/udyam.sqlite` to a private backup; this removes local sessions/orders on the next fresh start. Never run a destructive reset as part of normal setup.

## OCR and evidence initialization
Run `npm ci` before startup. Local OCR initializes lazily on consented document submission and reads the installed English model without runtime downloads. `npm run analyze` writes only aggregate evidence under `reports/`.
