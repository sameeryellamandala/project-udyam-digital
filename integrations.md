# Integrations

## Required local data adapters
Product catalogue powers recommendations/quotes. Mock GST and Udyam CSVs back verification. KYC image pack supports demo uploads; do not infer validity from filenames. Leads CSV powers later aggregate business analysis, not online identity checks.

## Groq testing adapter
`AI_PROVIDER=groq` uses `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b`. The backend calls Groq's OpenAI-compatible chat endpoint with a strict JSON schema. A constrained-decoder JSON failure permits one same-provider JSON-mode retry with local schema validation. The selected current model supports that mode. English/Hindi live checks use synthetic inputs only. Account quotas and temporary failures trigger an honest guided fallback, never an automatic paid-provider call. See [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and [current models](https://console.groq.com/docs/models).

## Later OpenAI evaluation
Set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` explicitly. The existing Responses API adapter remains available. No model has been chosen as the final paid production model; compare quality/cost first. External image reading is only available with this explicit image-capable setup and separate consent.

## Failure and privacy
Keep keys server-side and out of logs. Advisor context excludes registration/contact fields and redacts common private patterns from free text. No such filter guarantees removal of arbitrary personal data. Raw images stay local for Groq testing. Provider data policies apply to live chat.

## Future adapters
DigiLocker/e-sign, phone OTP, WhatsApp Business, payment collection and provisioning need actual provider credentials, sandbox behavior, consent and webhook verification. They are not required to demonstrate the core case. Existing partners can later receive review cases through an authenticated queue. Do not send messages externally in the prototype.

## Local reader
Tesseract.js and `@tesseract.js-data/eng` are pinned by `package-lock.json`. Code, WebAssembly and language data load locally after installation. Maximum two active readers, with a 45-second deadline and bounded image dimensions. Raw images/text are not saved. Rotated or unfamiliar layouts require review. See [upstream OCR API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
