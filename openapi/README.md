# Authoritative HTTP API contract

Edit `root.yaml`, referenced path items and schemas; regenerate with `make api-types`. Never edit `bundled/` or generated TypeScript/validators manually. Run `make api-check` before committing.

Domain ownership: Worship; Academy (future HTTP); Production (future HTTP); Partnerships (Web, future); Media (shared adapter, future HTTP); Email (Web: Resend delivery webhook); Forms, Roster and requests, Invoicing (4.1.0, planned: public uploads, offer page and Stripe webhook on Web, builder/inbox/invoice actions on Admin); Administration (internal only). Gamo Live and its Payments domain were removed in contract 3.0.0; public accounts (Identity and Accounts, Organizations and Memberships) in contract 4.0.0 (both 2026-11-16). Domains without operations are represented by ownership notes and tags, not speculative paths or duplicate schemas.

Use `bundled/public.json` only for reviewed public consumers. `bundled/internal.json` and generated internal documentation are restricted engineering material. There is no public API deployment or dedicated API application in this directory. See `docs/OPENAPI_ARCHITECTURE.md` and `docs/API_INVENTORY.md` for limitations and reconciliation findings.
