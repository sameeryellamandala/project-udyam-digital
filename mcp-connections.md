# MCP connections

## Decision
No MCP connection is required for the initial product. The app can call its own backend and the model API directly; CSV/database operations are ordinary server modules. MCP is not a requirement in the problem statement.

## When it would help
If multiple trusted AI clients later need the same capabilities, expose read-only `find_eligible_products` and `calculate_quote` tools backed by the existing engine. Require authenticated, scoped access and input schemas. Keep consent/verification/order writes in the application until authorization/auditing is designed.

## Planned boundaries
No general filesystem, database query or raw registry export tool. No government IDs/documents in tool logs. No MCP credentials in frontend code. Test unauthorized access, schema errors and result redaction before enabling a connector.

## Current status
Deferred intentionally. No server/connector is installed, no external account is connected, and no user action is required to run the core project.
