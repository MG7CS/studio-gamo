# Authoritative HTTP API contract

Edit `root.yaml`, referenced path items and schemas; regenerate with `make api-types`. Never edit `bundled/` or generated TypeScript/validators manually. Run `make api-check` before committing.

Domain ownership: Identity and Accounts (Web); Organizations and Memberships (Web, future); Worship; Academy (future HTTP); Live; Production (future HTTP); Partnerships (Web, future); Media (shared adapter, future HTTP); Administration (internal only); Payments (Live sandbox only). Domains without operations are represented by ownership notes and tags, not speculative paths or duplicate schemas.

Use `bundled/public.json` only for reviewed public consumers. `bundled/internal.json` and generated internal documentation are restricted engineering material. There is no public API deployment or dedicated API application in this directory. See `docs/OPENAPI_ARCHITECTURE.md` and `docs/API_INVENTORY.md` for limitations and reconciliation findings.
