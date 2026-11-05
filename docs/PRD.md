# Udyam Digital: product requirements

## Purpose and source
Help a small business discover, buy and track a suitable bundle on a phone with minimal human effort. Source: `reference/6ad9d4887d445_airtel_sync/Airtel_SYNC_Case.pdf`, pages 2-6, and the dataset README. Accel Business and all supplied businesses are fictional.

## Customers and scope
Support micro retail/services, professional offices, multi-site businesses and small manufacturers. Pilot professional offices (including clinics), with micro retail as a separate price-sensitive experiment. The aggregate comparison in `reports/lead-analysis.md` supports this initial hypothesis; it does not establish real market causality or clinic-specific conversion. Field sales/partners receive cases needing help; they remain an assisted path.

## Required customer journey
Customer sign-in through Clerk is required before opening business setup, using the advisor/KYC, or placing/viewing orders. Enforce this on the backend as well as the UI. Signed-out users see only the sign-in/sign-up screen. No guest checkout; preserved legacy guest records may be explicitly linked after sign-in.
1. English/Hindi discovery: business type, staff, sites, city tier, existing tools, desired services, budget. Ask only missing questions.
2. GenAI advisor: explain catalogue-based bundles in plain language. A guided form remains available if AI is unavailable, with an explicit mode label.
3. Quote: one fixed demo monthly total derived from supplied catalogue minimums, alongside the unchanged catalogue minimum–maximum reference range. Show quantities, one-time setup, minimum contract, prerequisites, estimated installation days and range warnings. A real provider must confirm actual price and availability. Taxes are excluded because no tax policy was provided.
4. Consent before KYC: document purpose, retention, external AI processing choice. Upload JPG/PNG/PDF GST/Udyam certificates, address proof and signatory ID as applicable. Extract and display masked fields for customer review, validate, offer replacement/manual review, and never invent a successful check.
5. Saved order and tracker: immutable price-range snapshot, stable ID, quote/KYC/installation/activation milestones, a typical installation date estimate, pending actions, help requests, and visibly simulated fulfillment updates.
6. Lead intelligence: aggregate funnel and segment analysis plus a rules-ranked follow-up queue with explainable factors and locally recorded sales handoffs. The ranking is a prioritisation aid, not a conversion prediction.

## Acceptance criteria
- All 25 products load from the CSV. Price and eligibility checks run on the server, including quantity, city, staff, sites, active GST and product prerequisites.
- Insufficient budget produces a visible warning or no-fit result, never a concealed overrun.
- New quotes/orders persist the backend-derived fixed demo amount and pricing policy, alongside catalogue ranges. Old order snapshots remain unchanged. Distinguish setup from monthly charges; never accept client-provided prices.
- Unknown/cancelled/suspended GST cannot unlock GST-required products. Synthetic PAN entity `X` and Udyam district `00` are accepted.
- Date-sensitive KYC uses 2026-07-15. Missing/unclear/stale/mismatched documents go to review.
- OCR fields are shown for explicit customer review. Under the approved Smart KYC v3 consent, files and necessary extracted fields/results may be retained encrypted and owner-scoped for up to seven days. Customers can replace individual files and delete their case. Raw OCR text and full signatory ID values are not retained as application fields.
- Orders survive refresh and restart and cannot be read from another browser session.
- Tracker provides order milestones, a clearly labelled simulated status progression, and a session-owned help request.
- Sales queue uses synthetic leads, hides contact/registration details, shows explainable priorities and records handoffs locally.
- If the AI is unavailable, show a clear retry notice without presenting a generated fallback answer. The structured package flow remains available. No raw KYC data or secrets in client storage/logs.
- The mobile journey works with keyboard navigation and announced errors.

## Proposed success targets
These are pilot goals, not achieved results: conversion >=12% versus 368/5000 baseline; median digital checkout <=10 minutes (measure separately from physical activation); mean lead-to-activation <=10 days versus 17.6 baseline; CAC <=Rs 12,000 versus ~Rs 15,000; six-month churn at least 20% below the measured dataset baseline. Track churn only after an eligible cohort matures.

## Optional and excluded
Voice/WhatsApp, a trained propensity model and additional regional languages remain optional. The prototype includes a basic rules-ranked sales view. No live government API, DigiLocker, e-sign, actual payments or real provisioning is assumed. No model fine-tuning or vector database is needed for 25 structured products.

## Delivery
Working code and <=3 minute demo; component/data-flow diagram; <=10 business slides; one-page privacy/security note. See `submission-checklist.md`.

## Advisor functional guide acceptance
Follow `AI_Business_Advisor_Functional_Guide.docx`: ask one useful discovery question, remember collected facts, translate needs, retrieve catalogue products, apply backend eligibility and dependency rules, compare validated ranges, preserve needs on additive changes, and hand a customer-confirmed selection to formal quotation. Form defaults are assumptions, not confirmed conversation facts. A no-GST customer can still use unrestricted products. Saying GST yes never replaces consented registry verification.


## Approved conversation-memory upgrade

Keep the existing Node.js app and LLM/provider. Add PostgreSQL-backed independent conversations with saved redacted history, structured requirement memory, create/list/resume/switch/delete controls and owner isolation using the current browser cookie. Missing changes preserve existing requirements; explicit removals and null/unknown values are distinct. General questions remain conversational and do not change selections. Optional services require customer selection before inclusion. Account authentication/cross-device recovery are future work; the local prototype retains seven-day browser ownership.


## Shared journey acceptance

Submitting the onboarding form creates or updates one PostgreSQL journey and confirms its submitted fields. Form, package recommendation and chat use that same ID and canonical requirement state. Chat edits immediately update subsequent form/package views; Review package only selects an offer. Navigation and retries must not duplicate sessions. Explicit New chat remains independent. Form submissions reject stale revisions, session-aware pricing/checkout uses backend-loaded requirements, and verification is bound to journey/revision. Preserve existing catalogue, quantity, eligibility, consent and immutable-order rules.


## Simplified customer form — 4 November 2026
At customer request, the form collects a single city tier and no location count or per-branch fields. Submitting the form quotes one installation site, clears branch details in that submitted session and uses the total cameras for that address. Existing saved orders and backend compatibility for earlier multi-location records remain intact. Separate branch installation/KYC workflows are outside the current form scope.
