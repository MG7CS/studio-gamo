# Gamo Live — Public Concert Discovery Launch Implementation

**Owner-approved visual reference:** attach the Gamo Live full-page homepage mockup from this conversation.  
**Seed catalog:** `gamo_live_verified_events_2026-10-15.json` (supplied with this prompt).  
**Working name:** Gamo Live.  
**Implementation application:** `apps/live` inside the Gamo Studios monorepo.  
**Goal:** a production-grade, real, searchable Christian live-event discovery site with outward links to the actual authorized ticket seller, plus a maintainable editorial publishing pipeline.

## Read this first: business model and non-negotiable truthfulness

Gamo Live starts as a **curated event discovery and outbound ticket referral platform**. It may list legitimate Christian concerts across U.S. cities **without claiming to produce, sponsor, represent, officially partner with, or sell tickets for those events**. Independent listings should say something concise such as: *Independent listing · Tickets sold by the external provider.*

A separate, existing Gamo Live organizer-owned ticketing system may exist in sandbox, but **do not route these third-party listings into Gamo checkout, create fake orders, generate passes, or turn on Stripe**. Respect all existing financial launch gates.

The provided screenshot is a **visual reference only**, not a data source. Its Kigali events, artists, dates, RWF prices, and any fabricated details must **not** enter production. The current first geography is **Phoenix, Arizona**, with carefully selected real events in other major U.S. markets. **No invented event prices, sold-out state, association claims, ratings, follower counts, photos, or attendees.**

Do not change the working name `Gamo Live`, the shared Gamo identity architecture, or other Gamo Studios applications beyond narrowly necessary integration fixes.

## 1. Working method: coordinated parallel agents

Use **multiple parallel Codex/Agy subagents wherever tasks are independent**, preferably separate worktrees or isolated branches, with a lead integrator. Do not have several agents change the same files or database schema simultaneously. The lead agent must identify dependencies, assign explicit ownership, merge/reconcile, and perform a whole-product acceptance check.

Suggested partition:

- **Agent A — UI and visual fidelity:** homepage, reusable discovery components, responsive event cards, desktop/mobile states, image sourcing rules, navigation. Owns front-end presentation files only.
- **Agent B — Data model and importer:** inspect D1 schema/OpenAPI, build `external_discovery` listing model and lifecycle with migrations/contracts where necessary, CLI publisher provisioning/import scripts, tests. Owns DB/API/import contracts and publishes interface types to the rest.
- **Agent C — Discovery and location:** event directory, search/filter/sort, cities, location chooser, mobile interactions, server-side queries, empty states. Coordinate interface types with B before modifying routes.
- **Agent D — Event detail pages and SEO:** server-rendered individual event pages, canonical URLs, event JSON-LD, location landing pages, sitemaps, crawlability, outbound-link labeling, social metadata. Coordinate route ownership with C.
- **Agent E — QA/security/content review:** independent user-journey validation, editorial accuracy vs source records, external link health, accessibility, performance, production privacy/security and launch readiness. Do not change core implementation files while other agents are writing unless approved by lead.

If the runtime supports fewer agents, use the same logical division in a safe sequence. The **lead integrator** owns final configuration, reconciliation, end-to-end testing, and readiness report; avoid unreviewed direct commits to `main` by separate agents.

**First action:** inspect the current repository and existing six-phase Gamo Live implementation. Reuse its entities, OpenAPI v1.3+, permission model, access gates and UI components when appropriate. Don't scaffold a redundant app, auth system, database, or visual framework. Update API contracts and tests before or with new endpoints.

## 2. Home page: implement the approved image faithfully

**Visual source of truth:** the attached full-page Gamo Live mockup. Preserve its composition, clean navigation, dark cinematic performance hero, large search bar, understated event-card grid, one featured-event visual, restrained organizer CTA, cream/neutral page background, typography hierarchy, spacing and warm accent. Tailor the content for the **U.S. launch**, never duplicate the fake event data, dates or currency from the reference.

Design standards from `AGENTS.md` apply: restraint, generous whitespace, a small number of purposeful sections, polished photography, no AI-template feature grids, fake metrics, surplus descriptions, floating cards for no reason, or ornamental gradients.

Homepage sections in order:
1. Navigation: Gamo Live logo, `Events`, `Artists`, `Venues` **only if a useful, real route exists**, `Organizers`, location selector, `Sign In`, one ticket-discovery CTA.
2. Hero: short discovery-led headline; concert photography that Gamo has rights to use; search (event/artist/venue), location, optional date; submit works and preserves query state.
3. Upcoming events: genuine published future listings queried by location/date, filters (all, weekend, concerts, worship nights, conferences **only if supported by real data**). Cards show artwork only where permitted, otherwise elegant non-deceptive typographic treatment; name, local event date, venue/city, and price **only if current and supported**. Clicking a card opens a real internal event page.
4. Featured event: one actual verified future event, selected editorially, only if event artwork can legally be displayed. Hide or use a restrained approved brand treatment if not.
5. Small organizer/artist CTA with clear routes; no lengthy platform marketing.
6. Footer: working navigation/legal/support links; only working social accounts.

No automatic carousel. No user-facing buttons or icons without a real action. `Heart` should have real saved-event behavior (login-safe/account or documented device persistence) or be removed until implemented.

**Desktop:** a true, full-width web page, not a centered software mockup. **Mobile:** explicitly designed, not scaled desktop: concise headline, easy location selection, search-first flow, attractive accessible cards, and no enormous top image that hides every event below the fold.

## 3. Explicit action contract: every visible control

Implement and verify, not merely render:

| UI control | Required behavior |
|---|---|
| Logo | Go home |
| Events and top-right ticket discovery CTA | Open searchable `/events` directory |
| Search icon/field + submit arrow | Enter text, submit query, show real results and no-result state |
| Location selector | Choose a U.S. city or request approximate device location on user action; preserve chosen location |
| Date selector | Functional date filtering; timezone-aware |
| Category/weekend filter chips | Real filter, consistent with available categories and local dates |
| Event cards | Internal canonical event detail page |
| External ticket button | Send visitors directly to verified original ticket seller or official venue/organizer listing; clearly label domain/provider and external handoff |
| Featured event | Same genuine event detail / verified ticket destination rules |
| Sign In | Existing shared Gamo account sign-in, safe return URL, not a demo account |
| Artists / Organizers | Purposeful public landing/onboarding routes and secure professional workspaces |
| Venues | Meaningful browsable real venue directory or omit nav item |
| Favorites | Real persistent save behavior or omit the icon |
| Footer / help / social | Real destinations, not `#`, placeholders, or unrelated routes |

Do not claim Gamo can refund, transfer, resend or verify passes issued by Ticketmaster, TicketWeb, AXS, churches, or venues. For external orders, customer service belongs to the respective provider and should be linked or described accurately.

## 4. Research seed JSON and publishing workflow

Use the attached JSON as a **verified-source editorial starting set**, not as immutable truth and not as permissions to scrape or reuse external marketing artwork. Sources were checked on **2026-10-15**; event availability can change at any moment. Each event record includes source URLs, local date/time and IANA zone, performers, location, external destination, and review flags. `null` means unknown; **never guess it**.

Before import, inspect all records, deduplicate identical event occurrences, validate source/event date/time/venue, resolve the actual official purchase URL, check sold-out/canceled/postponed status, and ensure event dates are still upcoming. Especially review flagged records and external links that could not be opened directly during research. The dataset contains **21 candidates**, **not 21 preapproved public listings**.

### Publisher account and role model

Provision one internal staff-managed **`Gamo Live Listings`** publisher identity through the *legitimate* existing admin/identity workflow. This account is **an editorial listing publisher only**; it must **not** masquerade as an event organizer or as the artist's authorized representative. Keep `published_by` separate from `original_organizer` and ticketing authority. Only a Gamo admin may grant listing publication rights. If a service account is preferable, use proper scoped service identity with audit logs and secret management, not shared human passwords or a fabricated verification-code bypass.

**Required script**, implemented in repo using existing tooling and contracts (choose naming consistent with repository):

```bash
pnpm live:publisher:provision --env staging --dry-run
pnpm live:publisher:provision --env staging --apply
pnpm live:events:import --file ./path/to/gamo_live_verified_events_2026-10-15.json --env staging --dry-run
pnpm live:events:import --file ./path/to/gamo_live_verified_events_2026-10-15.json --env staging --apply
pnpm live:events:publish --env staging --only-approved --dry-run
pnpm live:events:publish --env staging --only-approved --apply
```

Names may differ if monorepo conventions require; provide exact final invocations. Use `--env production` only with explicit owner approval and deployment configuration; never auto-publish on migration, build or application startup. Do not treat editor's role as proof of organizer verification. Script must be idempotent (unique external source/event ID or stable import key), safe to rerun, transactionally consistent, validate input, produce a clear skipped/created/updated/rejected report, limit privileges, and support dry-run by default. Maintain immutable provenance/audit history for edits and external destinations. Avoid hardcoded local absolute paths. Never embed credentials into scripts, logs or JSON.

Add a low-friction editorial review mechanism: draft → verified → approved → published → archived/canceled. Ensure a published page disappears from *upcoming* when the event is past or canceled, while preserving appropriate historical status where useful. Add a configurable freshness recheck schedule **if safely supported**, or a documented staff review procedure. Do not automate scraping in ways that violate publisher terms or overburden websites. Prefer authorized event feeds/APIs when available.

### Model requirements

External event record should minimally support:
- stable unique source identity, descriptive event title, performer/artist references or names, category
- correct local start/end times and timezone; venue/city/state, and address only when verified
- source attribution, provenance and last verified time
- original organizer/host **when actually verified**, distinct from `Gamo Live Listings`
- real external booking URL and `external_ticket_provider`; `external_only=true`
- independent listing disclosure and publication status
- permitted poster/photo asset and license/credit, or image-free fallback
- editorial override with audit/version history, cancellation and ticket-status sync
- canonical internal slug and city/metro association

Never create ticket inventory, local paid ticket tiers, QR passes, revenue/settlement entries, organizer bank accounts, fabricated purchasers or artist representation links for these records. Preserve the actual organizer's rights and accurate affiliation.

## 5. Search, location, cities and geo-based discovery

Start with genuine Phoenix metropolitan listings while supporting other major U.S. metros in the seed file (Atlanta, Orlando, Nashville, Houston, Los Angeles, Seattle, New York, Oklahoma City).

- Offer an immediate human-editable **city selector**. Its value is not bound to a person's precise address.
- Optionally provide **Use my location**; request browser geolocation only after explicit click, over HTTPS, with clear permission handling and an appropriate approximate city-level match. Do **not** demand street-address precision, silently harvest precise coordinates, or fail if permission is denied.
- A privacy-conscious coarse location suggestion may be offered based on documented hosting-provided country/region/city if available, but never assume precise accuracy; always allow manual override.
- Remember explicit city preference where appropriate; when unavailable, offer Phoenix or national discovery without falsely asserting it is the visitor's location.
- Location suggestions must not change search-engine-facing canonical page content by IP. Use stable routes like `/events/phoenix-az`, `/events/atlanta-ga` or a consistent route pattern compatible with current Astro routing. These must show distinct, truly relevant future inventory, not SEO doorway pages.
- Preserve intent when switching cities; handle nearby cities as metros without falsely renaming an event's actual city (e.g., Duluth under Atlanta region, Glendale under Phoenix region).
- Search and filters should work on actual persisted data; correct local timezones and DST. Results sort by start time and exclude past events by default.
- Sensible no-result states and nearby date/city alternatives must not imply inventory where none exists.

## 6. Search-engine visibility — build for real discovery, don't promise rankings

We need public pages that can be **crawled and indexed** when people search for things like “Christian concerts in Phoenix”, “worship concerts Arizona”, or named artists and venues.

Follow these source guidelines:
- Google Search Central — Event markup: https://developers.google.com/search/docs/appearance/structured-data/event
- Google Search Central — JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google Search Central — Spam and doorway-page policies: https://developers.google.com/search/docs/essentials/spam-policies
- Google Search Central — multi-regional pages and geo-targeting: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites

Requirements:
1. Server-render or prerender indexable event/listing content as real HTML; no client-only empty shell dependent on geolocation.
2. Each public event has a stable, indexable **individual detail page** with unique descriptive page title, meta description, canonical URL, Open Graph/Twitter metadata and real event facts. Publish dates, timezones and venue accurately. Link to source/organizer/authorized ticket seller.
3. Add schema.org `Event` JSON-LD on **each individual event leaf page**, never fabricate price, image, availability, organizer or official association. Valid timezone-aware startDate and Place/address; `offers.url` only when it **really leads to a ticket-purchase landing page**. If destination is informational, omit offer or model honestly. Distinguish offer seller from the Gamo publisher. Reflect cancellation/rescheduling when confirmed.
4. Index only useful city pages with verified inventory; unique factual title/copy and links, avoid boilerplate mass-generation and doorway abuse. If a city has zero substantive genuine inventory, do not fabricate a page to target that keyword.
5. Sitemap (and robots directives appropriate to environment), strong internal linking, breadcrumbs, relevant accessible headings, correct 404/410/redirect lifecycle. `noindex` on staging, private workspaces, temporary/no-value URLs; no accidental public indexing of draft events.
6. Set canonical base URL to **actual approved deployed host only**. Do not invent a new domain or deploy one before owner approval. Configure robots and sitemap once deployment host is set.
7. Add a measured Search Console readiness checklist, rich-results validation and optional Bing Webmaster Tools submission; **do not promise appearing at the top of Google or indexing immediately**.
8. Track actual click-through from Gamo event detail to external provider with privacy-respecting analytics; avoid forced intermediary redirections, spam, dark patterns or unapproved affiliate claims.

## 7. Copy, photography and external event rights

Treat this as a professional curated discovery publication. Public event pages may state verified facts and short **original, independently written summaries** rather than republishing full third-party descriptions. Link sources. Before reusing tour posters or artist photos, obtain rights or use permitted/licensed feeds/assets. Never hotlink random copyrighted posters just because a source page has an image. Use polished Gamo-owned or licensed performance imagery for hero, and restrained graphic fallbacks for posterless listings; no fake performer likenesses presented as genuine events.

Prominent, compact copy for each external event should clearly identify that tickets are sold and fulfilled elsewhere. External CTA examples: `Tickets at Ticketmaster`, `Tickets at AXS`, or `View official event` depending on destination. Gamo is not responsible for external ticket delivery/refunds. Avoid claims of partnership or endorsement.

## 8. Security and launch readiness

- Reuse real account sign-in and granular admin authorizations. No public `?demo_key=` access, sample buyer identity, auto-sign-in or production demo bypass.
- External URL fields: validate HTTPS and allowlist/validate expected hosts and redirect destinations. Prevent open redirects, javascript: links, unsafe protocols and malicious imported HTML. Handle provider link drift and user-reported wrong links.
- Protect provisioning and publishing scripts through existing admin authentication and cloud secrets; least privilege, audit logs, confirmation and proper dry-run.
- Verify imports never touch payments, payouts, refund logic or third-party organizer-owned event records.
- Build accessible, keyboard-operable forms/search/filters, usable on mobile including virtual keyboards, with loading, error and empty states.
- Test actual UI at 390, 768, 1024, 1440, 1920 widths and high-contrast/keyboard flows.
- Performance: compress and properly size permitted images, avoid large JS for simple filters, meet sensible CWV budgets, handle sparse inventory elegantly.
- Monitoring: external link health, missing-image fallback, 404s, publisher edits, indexing/crawl issues and reported inaccuracies.
- Preserve existing monorepo builds/tests. Add unit/integration tests for import/idempotency, RBAC, records, date filters/timezones, city routing, external CTA behavior and schema markup.

## 9. Deliverables, gates and reporting

**Phase A — architecture contract and independent tasks**: assess repo, propose minimal schema/API changes, identify parallel agent ownership, flag cross-cutting blockers. Then implement; don't stop at proposing a plan.

**Phase B — data/editorial pipeline**: staff publisher provisioning and safe repeatable import, review/publish workflow, migration/API/tests.

**Phase C — approved homepage and discovery pages**: full desktop/mobile fidelity, working events/filters/location/navigation, accurate empty states.

**Phase D — event pages and public SEO**: individual pages, honest external purchase links, city pages with actual inventory, validated structured data, indexability, crawlable HTML.

**Phase E — cross-cutting verification and staging**: merged branch, build/tests, security checks, responsive screenshots (home, event list, event details, city page), screenshot comparison to approved visual, walk-through from search to external official ticket destination. Report launch gates distinctly from completed coding.

Provide a completion report with: routes, files and migrations, 21-event import ledger showing approved/published/skipped/rejected, source URLs, validated external links, script commands and required secret/environment setup, screenshots at 390 and 1440, SEO tests and sitemap samples, security findings, remaining owner approvals, and exact staging/production deployment instructions. Do not claim any event was actually published or production launched until done and verified.

**Priority order if tradeoffs arise:** factual accuracy and trust → working buyer experience → security → visual fidelity → SEO → nonessential enhancements.

**Definition of done:** a real visitor, without an account, can land on Gamo Live, choose Phoenix (or another populated metro), discover verified upcoming events, open a professional Gamo event detail page, and use a clearly disclosed external link to continue to the original official seller; while Gamo editorial staff can maintain these listings without fake organizer accounts or manual database hacking.
