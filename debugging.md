# Debugging guide

| Symptom | Check / remedy |
|---|---|
| Blank page or API fetch failure | Run `npm start`, open the printed HTTP URL, not `index.html` as a local file. Inspect generic browser console errors. |
| Node SQLite import fails | Upgrade to Node.js 24+. |
| Port in use | Set another `PORT` in `.env`, restart and use the new URL. |
| AI remains guided | Check `AI_PROVIDER`, the matching `GROQ_API_KEY` or `OPENAI_API_KEY`, model access and server restart. Never paste key into chat/logs. |
| Quote rejected | Read the product-specific eligibility/dependency error; provide valid consent-bound GST or choose unrestricted items. |
| KYC needs review | Check missing documents, registry status, text clarity and mismatched/future/stale address proof relative to 2026-07-15. |
| Orders missing | Use the original hostname/browser cookie session. Expired cookies/deleted records do not provide cross-device recovery. |
| Duplicate submissions | UI disables action while pending; checkout request key returns the existing order. |
| Database unavailable | Check `DB_PATH` folder permissions and disk capacity. Do not reset data as a troubleshooting shortcut. |

## Logging policy
Log route category, generic failure code and timestamp if needed. Never log request bodies, raw IDs, document bytes, contact data, full provider errors or secrets. Use automated isolated cases for repeatable debugging. Provider unavailability should preserve input and result in explicit guided/manual-review mode.

## Local reader issues
If OCR dependencies are missing, run `npm ci`. Use a clear, upright JPEG/PNG of the supplied English layout (2 MB and 12 megapixels maximum). Local extraction is conservative; skewed/unfamiliar forms require manual review. No model key is needed for local reading. Do not fix mismatches by forcing a passed status.

Groq can return testing-rate limits or transient errors. The app then labels guided mode; retry later rather than enabling a paid provider silently. The reply guard also falls back if monetary amounts do not match the supplied quote/context.
