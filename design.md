# Experience and visual design

## Direction
Keep the existing calm green/cream identity, generous spacing, readable cards and visible progress. Desktop: step navigation, main task, price summary. Mobile: single column, readable step navigation and a visible total. Avoid decorative elements that look like functioning controls.

## Screens
1. Discover: clear synthetic-demo notice, English/Hindi selector, structured business fields and optional advisor conversation. AI mode and guided mode are labelled.
2. Package: recommendation reason, each catalogue item, editable quantities/removal/add-ons, budget warning, monthly/setup/contract/install summary. Dependencies rejected with a specific explanation.
3. Business details: installation address, owner and phone only when placing an order. Registration identifiers are optional for products that allow it.
4. Verify: consent first; four document categories; accepted image types and size; upload result, readable issues and masked extracted identifiers. Separate optional permission for external AI extraction.
   Choose local English reading, manual review or optional external AI. Show the reader used and per-document field-match/review results; allow replacing/removing images. Reading progress is announced, and API errors remain visible near the task.
5. Track: stable order number, actual recorded status, verification issues, estimate, and explicit note that installation is not connected. Refresh resumes the saved order.

## Interaction rules
- Show loading and disable duplicate submissions. Keep user inputs through recoverable errors and step navigation.
- Changing profile/registrations invalidates a stale quote/verification; server revalidates on checkout.
- Never turn a file selection into a verified badge. Display pending extraction/review separately from registry matches.
- Errors appear next to actions and in an `aria-live` region; labels attach to inputs; visible focus; no color-only statuses.
- Treat names and model replies as plain text/escaped HTML. No model-generated HTML.
- Full English/Hindi interface coverage is a later localization pass if any labels remain English in the initial foundation.

## Review checklist
Check 375px and desktop widths, long product names, large prices, missing AI key, no-fit budget, invalid registry, reload and keyboard-only operation.
