# Identity, onboarding and staff review

Built by Phase 2 Agent A; design of record: `docs/design/identity-and-ticketing.md` §4. Decisions: `docs/CLEANUP_LOG.md` D-100–D-115 (and D-120s legal, D-130s Academy).

## 1. People

- **Customers** (ticket buyers, parents, students): no account; `customer_profiles` keyed by email; they manage purchases through emailed links.
- **Providers** (musician, technician, church, agent, organizer, teacher, artist): per-product account (emailed code or that product's Clerk) plus a `provider_profiles` row.
- **Staff**: Cloudflare Access + gateway session; reviewers hold `staff_reviewer`.
- **Person**: `persons`, one row per verified email, shared across products (AGENTS.md exception). It carries display name, provider profiles and terms acceptances. It never grants sessions, accounts, roles or workspaces anywhere.

## 2. Sign-up and sign-in

```
sign-up:  email+name+role+terms -> challenge (Turnstile, limits) -> code -> verify: account + product account
          + consent rows + draft provider profile -> session -> /account/onboarding?role=...
sign-in:  email -> challenge (same answer for any address) -> code -> verify (no account? 401 neutral)
recover:  identical to sign-in (no passwords)
```

Codes are bound to product and flow, so a sign-up code cannot sign in elsewhere. Clerk mode mirrors this; Clerk errors are mapped to neutral messages (`packages/ui/src/lib/auth-errors.ts`).

## 3. Rate limits and abuse

Per hashed IP and hashed email: challenge 30/10 min and 5/15 min, verify 40/10 min and 15/15 min, clerk-session 30/10 min and 20/15 min. Turnstile on challenge outside local. `ip_hash` is stored on sessions, challenges and consent rows (HMAC with `PII_HASH_SECRET`).

## 4. Enumeration

Sign-in and recovery never reveal whether an address has an account (here or in another product): same response, nothing emailed to unknown addresses, the code step offers "Create one". Local simulation messages say "no account" for developers only.

## 5. Person linking

Linked only from an address the product verified itself (emailed code, its own Clerk verified email, an opened customer link). Idempotent and race-safe. "Unlink this product" clears `users.person_id` and sets `person_link_opt_out_at` (legacy unlinks recorded only in audit rows are honoured and backfilled). A Clerk email change moves the link only if that `users` row backs no other product. The emailed-code flow shares one `users` row across products, so unlinking affects them together; the account page says so.

## 6. Customer claim

A verified sign-up/sign-in attaches the guest `customer_profiles` row with the same address to the person; the account page lists orders and registrations read-only. Pages can embed `ClaimAccountPrompt` (`packages/ui/src/components/account/`); `/account/signup?claim=tickets|registration` adjusts the wording.

## 7. Provider gates and review

Publish needs: verified email, complete profile, current Provider (or Organizer) Terms, staff verification for church/musician/technician/teacher; payout setup reads "not available yet" and never blocks a profile. A DB trigger backs the review gate. States: draft -> submitted -> meeting_scheduled -> in_review -> verified (or changes_requested / rejected / suspended). Staff decide in `/review/*`; each decision is one batch (conditional status update + `verification_records` + audit). Stale forms and concurrent decisions conflict; `assertNotSelfReview` blocks own profile and own organization. Churches need a scheduled in-person meeting (default America/Phoenix, explicit zone). Worship `/church` needs a verified church profile. Organizers' first events are reviewed; `always_review` toggles every event. Providers are emailed (`provider_status`), with honest status when email is unconfigured.

## 8. Retention and erasure (staff procedure)

On a request to hello@gamostudio.org: confirm control of the address, then in D1 set `persons.erased_at`, replace `persons.email_normalized` with `erased:<hash>`, null `display_name`, do the same for the matching `customer_profiles`, revoke sessions and customer sessions, record an audit row. Financial rows keep amounts only. Link tokens expire 30 days after expiry; `email_log.recipient_email` is nulled after 180 days.

## 9. Owner setup

Turnstile keys, `PII_HASH_SECRET`, Clerk webhook secrets, Google in each Clerk app, legal review: `docs/RUNBOOK.md` §9.
