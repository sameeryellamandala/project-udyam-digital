# Feature development guide

## Discovery and advisor
Structured profile is the reliable baseline. Collect segment, staff/sites, tier, tools, needs and budget. AI chat returns a schema-bound proposed profile plus a reply; user confirms it before recommending. Guided mode is usable without a key. Do not send contacts or registration IDs to the advisor.

## Recommendation and quote
Load all 25 products from CSV. Select relevant eligible items using requested needs, segment and budget. Respect installation units: per-site for each location, per-user/device/line editable with bounded quantities. Reprice every edit on server. Reject unmet prerequisite alternatives and inactive/missing GST for restricted products. Return no-fit budget messages. Display minimum catalogue rates as prototype rates and taxes as excluded.

## Verification
Consent precedes transmission of identifiers/images. Validate GST structure/checksum and query supplied registries; accept synthetic conventions. Local OCR reads the supplied English layouts; optional external AI returns schema-bound fields for four kinds. Cross-check names, addresses, IDs and address-proof date relative to 2026-07-15. Unclear/absent fields require review. Model output is extraction, not proof of authenticity.

## Orders and help
Bind a stored verification to its session/profile. Revalidate/reprice server-side during checkout. Store snapshot with retry key. Tracker shows server-recorded state; never marks physical service installed. Assisted-review messaging covers uncertain documents and products needing follow-up. A real sales queue/dashboard remains future work.

## Localization and later scope
English/Hindi advisor supported through language setting; translate the complete UX in a dedicated pass. Regional voice/WhatsApp and lead scoring are stretch goals. Gather aggregate funnel evidence for rollout recommendations before making claims about savings or churn improvement.

## Implemented improvements
Guided mode interprets explicit English/Hindi staff counts, budgets and requested services. Local OCR returns per-document results and checks signatory expiry; unclear scans remain review-required. Recommendations prioritize requested-need coverage within budget and explain each service. Registration checks can refresh eligible add-ons before checkout.
