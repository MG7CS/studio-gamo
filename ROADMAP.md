# Gamo Studios — Roadmap

Gamo Studios is a Christian, mission-driven Public Benefit Corporation, formed to be mission-driven and not only profit-seeking. Its three programs, in order: **Gamo Academy, Gamo Worship, Gamo Production**. Work is ordered by mission need and dependency; organizational rules live in [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md).

Updated 2026-11-16. The earlier milestone checklists (Milestones 0–5, the design-first override and the Gamo Live milestone) are history; see this file in git (`git log -p ROADMAP.md`) and tag `four-programs-snapshot`.

## Done

- **Gamo Live removed** (2026-11-16): `apps/live`, ticketing, scanner and their tables (migration `0018`). Snapshot: tag `four-programs-snapshot`.
- **Public accounts removed** (cleanup two, Phase 1, 2026-11-16): public sign-in, Clerk, onboarding, provider profiles, the shared person record and all per-program dashboards (migration `0019`). Admin is the only dashboard.

## Now

1. **Front-end foundation** — [docs/superpowers/plans/2026-11-16-frontend-foundation.md](docs/superpowers/plans/2026-11-16-frontend-foundation.md): guard tests, base/semantic tokens, app-neutral shell with per-app `site.config.ts` manifests, primitives and patterns, catalog page, app migration. Rules: AGENTS.md "Shared front-end architecture" and [docs/FRONTEND_ARCHITECTURE.md](docs/FRONTEND_ARCHITECTURE.md).
2. **Public UI/UX polish pass**, Academy first, then Worship, then Production; findings are fixed in shared pieces.

## Next — cleanup two, Phases 2–4

Plan: [docs/superpowers/plans/2026-11-16-forms-emails-invoices.md](docs/superpowers/plans/2026-11-16-forms-emails-invoices.md) · spec: [docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md](docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md).

- **Phase 2 — Forms engine:** staff-editable, versioned forms rendered by `DynamicForm` (no JavaScript required), public form guard, chunked uploads to R2 (staff-only), submission emails, admin form builder, submissions inbox and file viewer.
- **Phase 3 — Roster, requests, offers, invoices:** private roster of approved musicians and technicians, service requests, one-click offer links (POST only), invoices with musician pay and any Gamo administrative line kept separate (Stripe Invoicing in test mode or manual mark-paid).
- **Phase 4 — Admin home and cron:** replace the admin demo workspace with real screens; daily cron for the email outbox and retention; docs and owner actions.

## Production gate (owner actions)

Nothing below is done by agents. Before real use:

- Approve live Stripe charges (Stripe Invoicing live mode); until then `assertStripeTestMode` blocks live keys and paid flows answer 503 in production.
- Set the R2 lifecycle rules for uploads.
- Set production environment secrets (per `docs/RUNBOOK.md` §3) and complete the owner actions in `docs/RUNBOOK.md` §12–§13.
- Accountant review of invoice, payout and administrative-line treatment; worker classification review.
- Safeguarding policy for minors before real Academy bookings.

## Routine for each change

1. Keep `docs/BUILD_LOG.md` current with changes, commands run and evidence.
2. Follow the test economy in AGENTS.md: targeted tests while iterating, `pnpm check:quick` per commit, full `pnpm check` once per merge.
3. Capture real screenshots of running pages for visual work.
4. Re-check copy against [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md): PBC statement only, no unapproved fees, no commercial superlatives.
5. Stop only for an owner-only decision ([§8 of the model](docs/GAMO_NONPROFIT_MODEL.md#8-decisions-requiring-approval)), a security gate or an exhausted environment; continue on independent work first.
