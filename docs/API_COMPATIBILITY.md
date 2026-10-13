# API compatibility decisions

## 0.1.0

Initial OpenAPI adoption of existing unversioned routes; no prior specification baseline. Source baseline: cb97c37 on main, initially four commits ahead of origin/main; clean worktree.

URLs and legacy JSON envelopes remain. Intentional validation/security behavior changes: production email-only session creation denied (403); event proposals now require organization membership (401/403); unpublished detail returns 404; invalid checkout quantity/tier and extra fields return 400 instead of coercion; unknown/missing checkout events return 404 instead of default pricing; free registration rejects paid/external events and cross-event/nonfree tiers with 409; malformed JSON, wrong media types and non-RFC3339 timestamps rejected; unexpected exceptions no longer expose messages. Signed live webhook events rejected; unapproved 5% administrative allocation and estimated processor deductions removed. Missing D1 binding now produces an explicit failure instead of an unmigrated Node fallback. Local demo session clients must explicitly configure ENVIRONMENT=local and ALLOW_DEMO_SESSION=true.

Existing UI screens have no REST fetch consumers. Service integration tests and the new HTTP contract suite validate local behavior. Real clients and production availability have not been verified. No production rollout was performed. This is a pre-production correction, not a promise of a working identity or ticketing system.

Future entries must identify affected consumers, migration/deprecation plan, exact comparison Base SHA, verification evidence and owner authorization for policy changes. Bump contract info.version for changes to existing operations/schemas.
