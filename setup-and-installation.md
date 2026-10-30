# Setup and installation

## Prerequisites
Node.js >=24 (built-in SQLite and fetch), a modern browser, and the extracted supplied data directory. Verify with `node --version`. The local reader uses Tesseract.js and its installed English model.

## Local startup (PowerShell)
1. Open this project folder in a terminal.
2. Run `Copy-Item .env.example .env` once; do not overwrite an existing configured file.
3. Optional: edit `.env` and set `GROQ_API_KEY` (testing provider). Never put it into browser files.
4. Run `npm ci` to install the locked dependencies and English OCR model.
5. Run `npm start`.
6. Visit `http://localhost:3000`.

## Configuration
`PORT=3000`, `HOST=127.0.0.1`, `DB_PATH=var/udyam.sqlite`, `AI_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-120b`, `GROQ_API_KEY=`. The server loads `.env` with Node's built-in loader. `DATA_DIR` can override the supplied CSV directory. KYC reference date is fixed in code; do not change it for the exercise.

## Checks and shutdown
Run `npm test` for isolated automated tests. Stop the server with Ctrl+C; restart to load environment changes. Database tables initialize automatically. Keep `.env` and `var/` out of version control. If port 3000 is occupied, choose another `PORT` in `.env` and use that URL.

## Production prerequisites
Do not publicly expose the local prototype as production. Add verified login, HTTPS/Secure cookies, encryption, backups, scalable abuse limits, deployment monitoring and a reviewed processor/retention policy first.

## Local OCR and reports
Local reading makes no external image requests after package installation. It supports the supplied English form layouts conservatively; skewed/unfamiliar images may need review. Run `npm run analyze` for aggregate business evidence.

## Switching providers later
Only explicitly setting `AI_PROVIDER=openai` enables the paid OpenAI adapter with `OPENAI_API_KEY` and `OPENAI_MODEL`. There is no automatic provider switch on failures. Groq limits/outages preserve guided mode; local OCR is unaffected. Never commit `.env`.
