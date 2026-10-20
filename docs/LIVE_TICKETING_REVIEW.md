# Gamo Live paid ticketing — owner review (2026-10-19)

What to read after the run. Kept short; details are in the linked documents. Nothing here is committed, pushed or deployed.

## 1. Document changes

Read them with: `git diff a167960 -- AGENTS.md SECURITY.md DESIGN.md ARCHITECTURE.md README.md docs/ packages/ui/src/components/legal/content/`

| File | Main change |
| --- | --- |
| `AGENTS.md` | Header says rules can be changed with a recorded reason (owner-only actions excepted); §1 Academy, Worship, meeting verification, gift safeguards; §2 Stripe approved in test mode; §3 Live and admin first, all four launch together, `/promote` out of the frozen list, the event-panel exception; new §7 Payments and money; retired rules clarified |
| `SECURITY.md` | Payments section rewritten: keys by environment, webhook handling, mode safety, gifts, Connect data, Terminal readers, door staff links, cash |
| `DESIGN.md` | "Previews" → "Test mode"; audience wording (document only); Promote CTA note; checkout and door screen added |
| `ARCHITECTURE.md` | Rewritten from the code, plus payments |
| `README.md` | Status and Live row |
| `docs/LIVE_REQUIREMENTS.md` | §2 current; `/promote` gone; meeting verification; §3.5 now "Later"; new §8 (paid ticketing, door, reports, ledger, admin) |
| `docs/LIVE_DATA_MODEL.md` | New §8: the paid tables (migrations 0008–0012) |
| `docs/LIVE_SCREENS.md` | Sidebar and `/promote` fixed; new §I with every new screen, where it sits and presses per task |
| `docs/LIVE_PAYMENTS.md` | New: Mode A and B, fees, gifts, webhooks, refunds, ledger, door, Terminal, keys, stand-in, Stripe sources |
| `docs/ADMIN_REQUIREMENTS.md` | Four-area shell; meeting for every partner; Live payments and Live settings tabs; "settings, billing" and "Live orders and refunds" removed from the not-yet lists |
| `docs/REBUILD_PLAN.md` | Meeting rule; product order |
| `docs/GAMO_NONPROFIT_MODEL.md`, `docs/NONPROFIT_TRANSITION_CHECKLIST.md` | Minimum only: accurate PBC banner, "this document wins" removed, Academy audience, gift and sponsorship wording, `gift_to_organizer` as `third_party_payable`; checklist items for gifts to Gamo, sales tax, surcharging. **A full rewrite of both files is a separate task for you.** |
| `docs/RUNBOOK.md` | New §7: Stripe, Connect, Terminal, webhooks (test, then live) |
| `docs/DECISIONS.md` | Owner decisions, rule changes, design choices |
| Legal drafts | `ticket-terms.ts`, `organizer-terms.ts` rewritten (version `2026-10-19-draft.3`, still drafts) |
| Config | `env.ts`, `env-validation.ts` (+ test), preflight (+ test), `.dev.vars.example` files, `wrangler.toml` vars |

### Every rule changed or removed

| Old rule | New rule | Reason |
| --- | --- | --- |
| No donation, membership or sponsorship processing until the nonprofit checklist; never "donation/donor" | Gifts and sponsorships allowed with safeguards (receiver named, organizer receives Live gifts, no tax claims, ledger category, "gift" wording; gifts to Gamo itself and memberships wait for legal review) | Gamo is a PBC; organizer gifts and class sponsorships are product features |
| Academy speaks first to students, parents and families | Academy is for anyone, plus production training; sponsorship by any organization | Your corrected description |
| Churches verified in person | Every partner verified through a meeting, video or in person | Your decision 6 |
| No external service without approval | Same, with Stripe, Connect and Terminal approved in test mode | Your decision |
| Order: Gamo Live first | Live and admin first as the reference; all four launch together | Your plan |
| `/promote` frozen | Removed from the list (page deleted earlier) | Out of date |
| Live event page frozen entirely | One exception: paid states in the action panel | Paid events need an entry point |
| Staff roles retired | Retirement covers admin staff only; event-scoped door staff links are current | Door sales |
| Paid tickets, door links, transfers "not in v1" | In scope | Your decision 1 |
| Ticketing states labeled "previews" | "Test mode" on payment screens; nothing else "preview" | Products are launching |
| Mission doc "is the authoritative reference … wins" | AGENTS.md prevails; short PBC banner | Out of date |
| — | New permanent payment rules (AGENTS.md §7) | Your decisions 2–5 |
| `STRIPE_TEST_CHECKOUT`, `TICKET_QR_SECRET_*`, `CUSTOMER_LINK_SECRET`, `SCANNER_SESSION_SECRET` | Removed; new `LIVE_TICKET_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, local-only `ALLOW_STRIPE_STANDIN` | Old design leftovers |

## 2. Structure of the new screens

Full list with routes: `docs/LIVE_SCREENS.md` §I. No new top-level areas.

- **Organizer** (still Overview, Events, Organization, Settings): a paid event's page gets tabs **Overview · Tickets · Orders · Door**; paid setup (policies, fees, gifts) is a new editor section; check-in for paid events is the door screen's Check in mode (the old check-in URL redirects); Organization gets tabs **Profile · Payments**, and a verification card on Profile.
- **Public:** three-step checkout in the split-screen design, order page in the ticket-page design, find my tickets, transfer, refund request, the door staff PIN page.
- **Admin** (still Overview, Community, Gamo Live, Legal): Gamo Live gains **Payments** and **Live settings** tabs; the meeting step is on the organization page; churches use the same meeting form.

| Task | Presses |
| --- | --- |
| Create a paid event | about 8, plus typing (editor → Tickets tab → Preview checkout → Submit) |
| Buy online | 5 on Gamo, then Stripe |
| Sell at the door, cash | 4 |
| Sell at the door, buyer's phone | 3 |
| Refund an order (organizer) | 4 |
| Verify an organization (admin) | 3, then 1 (held), then 1 (verify) |

## 3. Proposals (built this way; you can choose the alternative)

1. **Free registration stays separate** from ticket types (price-0 types are possible later). *Alternative:* move free registration onto ticket types now.
2. **Processing cost borne by the organizer**, never a card surcharge. *Alternative:* split or absorb by Gamo (surcharging is legally restricted; not built).
3. **First paid event always reviewed**, even after a first free event. *Alternative:* the normal review rule only.
4. **Who may sell:** verified (meeting held) + payments ready + an owner accepted the current organizer terms. *Alternative:* drop verification for small events, or allow cash-only sales without Stripe readiness.
5. **No Gamo fee on gifts.** *Alternative:* a fee on gifts.
6. **Gifts refunded only with the whole order or by the organizer.** *Alternative:* refund gifts proportionally.
7. **No Gamo fee on cash or comp door sales.** *Alternative:* charge the fee on cash sales (it would have to be invoiced, since no money passes through Stripe).
8. **Retention:** names and emails removed 90 days after the event; orders, amounts, references and the ledger kept. *Alternative:* a fixed accounting period you set with an accountant.
9. **Fee shape:** per ticket, fixed cents + a percentage of the discounted price, both 0. *Alternative:* per order.
10. **Mode B payouts** prepared only after the event's date has passed. *Alternative:* rolling payouts.
11. **Refund choices:** none / until 24, 48, 72 or 168 hours before the start / any time before the start. *Alternative:* other hour choices.
12. **Hold time:** 35 minutes from Pay (Checkout session 31 minutes, the minimum Stripe allows is 30). *Alternative:* longer.
13. **Door sales platform switch** starts **on**; card sales still need a chosen funds-flow mode. *Alternative:* start off.
14. **Staff link expiry:** 12 hours after the event's last date; lock 15 minutes after 5 wrong PINs.
15. **Refunded seats are not put back on sale** (so a failed refund can always give its tickets back). *Alternative:* return refunded seats to inventory.
16. **The Gamo fee share comes back with every refund** (to the buyer when they paid it; credited to the organization when it absorbed it). *Alternative:* keep the fee on refunds (the owner's brief warns against iTickets' "fees never refunded").
17. **Online-only rules:** hidden types, sales windows and attendee names apply to online buyers; door staff and organizer comps may sell hidden types and outside the sales window (never beyond capacity or per-order limits). *Alternative:* apply sales windows at the door too.
18. **The door may sell after the start** while the check-in window is open. *Alternative:* stop door sales at the start.
19. **Preview orders** are test-mode only (refused with live keys in production) and are deleted when voided, so they never pin a draft's dates or count anywhere. *Alternative:* keep voided previews as records.
20. **Verification "waiting"** in the admin now means "verification requested or meeting held" (organizations ask for it), not "unverified with live events". *Alternative:* the old meaning.
21. **Submitting a paid event needs a verified organization** (drafts can be saved before). The admin also cannot approve a paid event of an unverified organization.
22. **Transferred tickets get their own link**; the buyer transfers once from the order page, then only the new holder can pass it on; transferred tickets cannot be refunded by the original buyer. *Alternative:* the buyer keeps control.
23. **Cash orders are refunded only at the door's cash drawer** (online refund refuses them; an event cancellation lists them as "refund in cash").

## 4. Contradictions and things section 3a missed

- **`events` cannot simply be altered** to add `paid_tickets` (SQLite CHECK constraints; D1 keeps foreign keys on and dropping a table cascades). Migration 0008 copies the dependent tables aside and restores them. **Back up before applying it remotely.**
- **Terms versions:** Live recorded every acceptance with the shared draft version, not the document's own; fixed so the new ticket and organizer drafts take effect per document. Existing organization owners must accept the new organizer terms before selling.
- **`packages/domain/package.json`** exported `./ticketing`, `./scanner` and `./public-form-guard`, which point at files that no longer exist; removed.
- **`ticket-qr.ts` and `link-tokens.ts`** (old design, unused) were still exported from `@gamo/domain/security`; removed with their tests. `pin.ts` is kept and reused for door PINs.
- **`LIVE_DB` is bound only locally** in `apps/live`, `apps/web` and `apps/admin` `wrangler.toml` (preview and production need the owner-created databases; already in RUNBOOK §5).
- **Live's `email_outbox` table is unused**; emails are sent directly. Kept that way (a queue for large cancellations stays "later").
- **Organization verification** had no guard against two decisions and sent no email; the meeting flow replaces it with guarded, emailed steps.
- **The admin's provider-review service** (shared database) still says "in-person" in its emails and messages; its wording is changed with the meeting step.
- **Free registrations and paid tickets share the event's capacity differently:** free registration still counts `event_occurrences.seats_taken`; paid events count `occurrence_inventory`. An event is one or the other (its admission), so they never mix.
- **Changing an organization's funds-flow mode after its Stripe account exists** is not handled: one connected account is stored, and an account onboarded for Mode A (takes payments) may not suit Mode B (receives transfers) or the reverse. Needs your decision before choosing per-organization overrides in production.
- **Reconciliation in Mode A** derives Stripe's processing cost as the balance transaction's fee minus Gamo's application fee (the contract does not read `fee_details`); exact while the Gamo fee is $0.
- **The old privacy draft** said "we log who viewed, downloaded, transferred or reissued a ticket" (old design, not true now) and "in-person verification meeting"; corrected in privacy-policy draft.3.
- **Free events and free registration are unchanged.** Paid events lock their dates once any order exists, like registrations do.
- **`ARCHITECTURE.md`'s admin worker name** `gamo-admin-next` is in fact the local name in `apps/admin/wrangler.toml`; kept, with the preview name added.

## 5. Later in the run

### The one change to a frozen marketing page

`apps/live/src/pages/events/[slug]/index.astro`: one new branch in the action panel, using the panel's own markup and classes (27 lines added, 1 changed; nothing else on the page touched). To revert it: `git checkout HEAD -- 'apps/live/src/pages/events/[slug]/index.astro'` (the page then shows paid events as "Free event. No registration needed", so keep it unless you prefer another wording).

```diff
diff --git a/apps/live/src/pages/events/[slug]/index.astro b/apps/live/src/pages/events/[slug]/index.astro
index 35cd7b4..c81cff9 100644
--- a/apps/live/src/pages/events/[slug]/index.astro
+++ b/apps/live/src/pages/events/[slug]/index.astro
@@ -779,7 +779,33 @@ const pageDescription = metro
                       <strong>Refunds:</strong> {event.refundPolicyText}
                     </p>
                   )}
-                  {event.admission === 'free_registration' ? (
+                  {event.admission === 'paid_tickets' && event.paidTickets ? (
+                    event.paidTickets.state === 'on_sale' ? (
+                      <>
+                        <a
+                          class="mt-6 w-full inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta hover:bg-terracotta-deep px-6 py-3 font-semibold text-white transition-colors"
+                          href={`/events/${event.slug}/tickets`}
+                        >
+                          Get tickets
+                        </a>
+                        <p class="mt-2 text-xs text-muted">
+                          {event.paidTickets.fromCents != null
+                            ? `From ${formatUsd(event.paidTickets.fromCents)}. `
+                            : ''}
+                          No account needed. {event.paidTickets.refundLine}
+                          {event.paidTickets.sellerLine ? ` ${event.paidTickets.sellerLine}` : ''}
+                        </p>
+                      </>
+                    ) : (
+                      <p class="mt-6 rounded-xl bg-cream p-4 text-sm text-ink">
+                        {event.paidTickets.state === 'sold_out'
+                          ? 'Sold out.'
+                          : event.paidTickets.state === 'not_open' && event.paidTickets.opensAt
+                            ? `Tickets go on sale ${new Date(event.paidTickets.opensAt * 1000).toLocaleString('en-US', { timeZone: event.timezone, dateStyle: 'medium', timeStyle: 'short' })}.`
+                            : 'Ticket sales have ended.'}
+                      </p>
+                    )
+                  ) : event.admission === 'free_registration' ? (
                     event.capacity != null && event.seatsTaken >= event.capacity ? (
                       <p class="mt-6 rounded-xl bg-cream p-4 text-sm text-ink">
                         Registration full. Check back in case seats open up.
```

Two data-only changes keep the other frozen pages honest without touching them: the catalog read model marks paid events `admissionType: 'paid'` (so the frozen event card no longer says "Free RSVP" for a paid event; it shows "View Details") and fills `priceMinCents` with the lowest price in force (so `/live` on the web app shows "From $X" and the event page's structured data carries a real offer).

### Found and fixed while integrating

- **The admin's Overview counts failed on D1** (not in Node's SQLite): D1 refuses a compound SELECT of more than five terms and the new counts query had seven. Rewritten as one batch of single counts; the test database now refuses the same thing, so unit tests catch it.
- Paid checkout could not find the organization to charge (the quote lacked its id); fixed.
- Two links named "Registrations" on a free event's page showed different numbers (rows vs people); the redundant action-bar link was removed (the Registrations tab stays and its count equals its list).
- Door refunds could not refund people admitted at the door; refunds now take an explicit "include admitted tickets" option used only by the door.
- A flaky test (a tampered link sometimes was not tampered) was fixed.
- Attendee names were checked at checkout but not stored; migration `0012` keeps them until the tickets are issued (removed at 90 days).
- Voided preview orders pinned a draft's dates; they are now deleted (they never write ledger rows).
- The admin could not email a buyer when Gamo (Mode B seller) declined a refund; a Gamo-worded email was added.
- The admin's order search moved from the admin app into the domain (SQL lives in the domain).
- Ticket holders were not told when the admin approved a venue change that had waited for review; the admin's approval now emails them (the same notice the organizer's editor sends when a change goes live at once), and the result message says how many were emailed.
- The Payments tab's count summed refund requests and disputes but opened on all orders; removed (the Overview cards and the Payments sub-tab chips carry those counts, each equal to its list).
- Organizers had no list of orders with a refund request; a "Refund requests" filter and count were added.
- Test files next to app libraries were not run by `pnpm test`; the glob now includes `apps/*/src/**/*.test.ts`.
- The existing `live-flow` spec was updated for intended changes (seat label, door screen URL, the Organizations list's "waiting" meaning, no one-press verify); both flows pass.

### Independent review (money, security, privacy) and what was done

An agent that had not seen the work read the whole change set. No critical defects. Its findings and the outcome:

| # | Finding | Outcome |
| --- | --- | --- |
| 1 (high) | Refunds and disputes of payments Gamo does not know (an organization's other sales on its own account in Mode A) were answered "retry", which could keep Stripe retrying for days and get the webhook endpoint disabled, so real payments would stop being confirmed | Fixed: only events naming a Gamo order or refund are retried (and a refund for an order not yet paid waits for its payment); everything else is recorded as ignored. Tested. |
| 2 (high) | With a Stripe key but no platform webhook secret, Mode B card sales stayed open though no payment could ever be confirmed | Fixed: new reason "webhook missing" closes card sales in both modes; shown in the organizer Payments page and the admin. Tested. |
| 3 (medium) | A second door link could refund another drawer's cash sale from its own drawer (and keep the cash) | Fixed: staff refund cash only from the drawer that took it and card sales only from their own link; organizers can refund any door sale. Tested. |
| 4 (medium) | A payment whose session id was not stored yet (rare write failure) was matched as a "mismatch" and dropped | Fixed: such a payment is retried for an hour so it is applied once the id is stored. A real amount or currency mismatch is still logged and not fulfilled; **an admin view of mismatched payments and an automatic refund for them are not built** (to decide). |
| 5 (medium) | No rate limit on holding seats | Fixed: 20 checkouts per IP per 10 minutes and 10 per buyer email per hour. Tested. |
| 6 (medium) | Free text (refund reasons and notes, comp reasons, drawer notes, door link names) survived the 90-day cleanup | Fixed. Tested. |
| 7 (medium) | A buyer's refund request racing a transfer could refund a ticket someone else now holds | Fixed: each refuses the other inside its own write. Tested. |
| 8 (low) | Mode B refunds failed when the organization had no payout account any more | Fixed: refunds never need it. |
| 9 (low) | Mode A: Stripe returns the application fee in proportion on partial refunds; the ledger records the exact fee share, so they can differ by cents | Not changed: exact while the Gamo fee is $0; to revisit before a fee is set (read Stripe's application fee refund). |
| 10 (low) | Visiting the payments page with `?stripe=refresh` started Stripe onboarding | Fixed: only the page's own button (a POST) starts it. |
| 11 (low) | A payout whose transfer answer was lost and is re-sent after Stripe's 24-hour idempotency window could be sent twice | Not changed: payouts are test mode only and owner-approved; before live payouts, look the transfer up by its payout id before re-sending. |
| 12 (low, policy) | Mode B: a dispute deducts the whole disputed amount (including Gamo's fee and a gift) from what Gamo owes the organization; a refund after a payout can make the balance owed negative | **Your decision:** who carries dispute and post-payout refund losses in Mode B. |
| 13 (low) | The per-IP PIN limit is skipped when the request has no IP (only the 5-tries lock remains) | Not changed: Cloudflare always sends the IP in production. |
| 14 (low) | Voiding a preview still waiting at Checkout left the Checkout open | Fixed: it is expired first. |

### End-to-end specs (built workers, local Stripe stand-in)

Three new specs, each running its own servers: `tests/e2e/live-paid-checkout.spec.ts` (buying online: fees passed on and absorbed, gifts, promo and access codes, duplicate and out-of-order webhooks, the last-seat race, refunds within and outside policy, transfers, cancellation refunding everyone, find my tickets), `tests/e2e/live-door.spec.ts` (staff links and PIN lockout, cash drawer open and close with the difference, buyer's phone, simulated reader, comps, door-day totals linking to lists of the same length, door refunds), `tests/e2e/live-payments-admin.spec.ts` (verification by meeting, the "who may sell" checklist, both funds-flow modes end to end with the right seller wording, a fee change not touching sold orders, the Payments tabs with counts equal to their lists, disputes, payouts refused before the event). Run one with, for example, `FLOW_PORT_BASE=5328 E2E_APPS=live-flow pnpm exec playwright test tests/e2e/live-paid-checkout.spec.ts` after building live and admin.

Bugs they found, fixed:

- **A paid event could be sent for review and approved while its payments were not ready** (only verification was checked). Now submitting and approving both need verified + payments ready + current organizer terms, with plain messages in the editor, on the event page and in the admin; the public checkout says early (on its first step) when card payments are off.
- **The buyer's-phone QR held a bare path with the stand-in** (a phone could not open it); door links now use the configured Live origin (this server only with the local stand-in).
- **The door screen said "type the code printed under it"**, but paid tickets show only a QR; the wording now says paid tickets need the camera. *Not built:* a typed fallback for paid tickets without a camera (for example looking an order up by reference) — the camera works on the production https address.
- The fee line was "Gamo service fee" at checkout and "Gamo fee" on receipts; now "Gamo service fee" everywhere a buyer sees it.
- The admin's fee history showed the starting setting as "Dec 31, 1969"; it now reads "the starting setting".

Noted, not changed: email links come from `PUBLIC_SITE_URL_LIVE` (read at build time by pages and at run time by webhooks); deployed builds set it once for both, so links agree there (the harness runs on other ports, so its emails mix the two). The QR helpers of two specs load `jsqr` from pnpm's store, where it is already present as a dependency of another package; if you prefer, add it as a declared dev dependency. Not covered by the specs: the 30-minute hold expiring on its own, async payment failure and decline on the stand-in page, the find-my-tickets rate limit, the door's offline notice, camera scanning, and sending a payout (only possible after an event's dates have passed).

### Screens for your visual review

Real screenshots of the running built workers (desktop and 390 px for every page the specs check, 172 files) are in `test-results/screens-final/` (git-ignored): `1-buying-online`, `2-door`, `3-admin-and-modes`, `4-live-flow`, `5-admin`. To regenerate: build live and admin, then run a spec with `E2E_SCREENSHOTS=<folder>` set. Phone captures are full-page, so the fixed phone tab bar shows in the middle of long pages (an artefact of the capture, not of the page).

Visual items I did not change (owner-led design):

- **Checkout step 3 (review and pay) does not fit one screen on a 1280 × 720 laptop**: the terms box and the Pay button sit at the bottom edge of the panel. The split-screen rule says such pages fit one screen; options: tighten the receipt card (smaller line spacing, policies folded into one line), or move the terms consent to its own short step. Your call.
- The door screen's Sell card uses the shared stepper buttons; on a phone, check that the 56 px targets and the totals grid feel right at a real door.
- The admin Overview now has ten count cards (grid 3 / 5 columns).

### Not built (and why)

- A queue for large event cancellations: refunds for a canceled event run in the cancel request; a very large event could exceed a Worker's request limits. Proposed: move refunds and emails to a queue (needs a Cloudflare Queue or cron, an owner decision).

- A gift step at the door, and partial (per-ticket) door refunds: door refunds are whole-sale.
- Door staff see door-day totals as plain numbers, not links (they have no access to buyer lists). This departs from "every number is a link"; the alternative is hiding the totals from staff.
- Wallet passes, Tap to Pay, offline sales, sales tax, card surcharging: later (requirements §3.5).
