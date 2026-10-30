# Udyam Digital: product requirements

## Purpose and source
Help a small business discover, buy and track a suitable bundle on a phone with minimal human effort. Source: `6ad9d4887d445_airtel_sync/Airtel_SYNC_Case.pdf`, pages 2-6, and the dataset README. Accel Business and all supplied businesses are fictional.

## Customers and scope
Support micro retail/services, professional offices, multi-site businesses and small manufacturers. Pilot professional offices (including clinics), with micro retail as a separate price-sensitive experiment. The aggregate comparison in `reports/lead-analysis.md` supports this initial hypothesis; it does not establish real market causality or clinic-specific conversion. Field sales/partners receive cases needing help; they remain an assisted path.

## Required customer journey
1. English/Hindi discovery: business type, staff, sites, city tier, existing tools, desired services, budget. Ask only missing questions.
2. GenAI advisor: explain catalogue-based bundles in plain language. A guided form remains available if AI is unavailable, with an explicit mode label.
3. Quote: quantities, monthly subtotal, one-time setup, minimum contract, product prerequisites, estimated installation days. Use the catalogue minimum as a disclosed prototype price policy; taxes are excluded because no tax policy was provided.
4. Consent before KYC: document purpose, retention, external AI processing choice. Upload GST/Udyam certificates, address proof and signatory ID as applicable. Extract and validate, offer correction/review, never invent a successful check.
5. Saved order and tracker: immutable price snapshot, stable ID, pending/review/ready status and typical activation estimate. Physical installation remains a simulated external operation.

## Acceptance criteria
- All 25 products load from the CSV. Price and eligibility checks run on the server, including quantity, city, staff, sites, active GST and product prerequisites.
- Insufficient budget produces a visible warning or no-fit result, never a concealed overrun.
- Unknown/cancelled/suspended GST cannot unlock GST-required products. Synthetic PAN entity `X` and Udyam district `00` are accepted.
- Date-sensitive KYC uses 2026-07-15. Missing/unclear/stale/mismatched documents go to review.
- Orders survive refresh and restart and cannot be read from another browser session.
- Provider failures display an honest fallback. No raw KYC data or secrets in client storage/logs.
- The mobile journey works with keyboard navigation and announced errors.

## Proposed success targets
These are pilot goals, not achieved results: conversion >=12% versus 368/5000 baseline; median digital checkout <=10 minutes (measure separately from physical activation); mean lead-to-activation <=10 days versus 17.6 baseline; CAC <=Rs 12,000 versus ~Rs 15,000; six-month churn at least 20% below the measured dataset baseline. Track churn only after an eligible cohort matures.

## Optional and excluded
Voice/WhatsApp, partner dashboard, lead propensity scoring and additional regional languages follow the core. No live government API, DigiLocker, e-sign, actual payments or real provisioning is assumed. No model fine-tuning or vector database is needed for 25 structured products.

## Delivery
Working code and <=3 minute demo; component/data-flow diagram; <=10 business slides; one-page privacy/security note. See `submission-checklist.md`.
