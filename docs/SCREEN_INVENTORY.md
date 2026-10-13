# Gamo Studios UI Screen Inventory

## Global Brand (`apps/web`)
- [x] `/` (Homepage / Root Hub)

## Worship Application (`apps/worship`)
- [x] `/` (Worship index - Not required? Using web)
- [x] `/hire` (Church posting wizard)
- [x] `/apply` (Musician application flow)
- [x] `/apply/identity` (Identity capture demo)
- [x] `/admin` (Worship dispatch/admin radar)
- [x] `/admin/assign` (Assignment flow)
- [x] `/check-in/[id]` (Check-in and standby demo)

## Academy Application (`apps/academy`)
- [x] `/` (Academy listing / courses)
- [x] `/lessons` (Lesson booking and details)
- [x] `/host-apply` (Host application flow)

## Live Application (`apps/live`)
- [x] `/` (Events listing / discovery)
- [x] `/events/[id]` (Event details and tier selection)
- [x] `/checkout` (Stripe sandbox checkout flow)
- [x] `/ticket` (Generated ticket / QR)
- [x] `/organizer` (Organizer dashboard)

## Production Application (`apps/production`)
- [x] `/` (Production portfolio / services)
- [x] `/contact` (Consultation intake)

## Global Admin Hub (`apps/admin`)
- [x] `/` (Admin dashboard / quick stats)
- [x] `/legal` (Legal document management)

## Planned — Nonprofit mission, Gamo Live, Church Partnerships & dynamic homepage (Not started)
See [GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md) and [GAMO_LIVE_AND_PARTNERS.md](GAMO_LIVE_AND_PARTNERS.md). Desktop + mobile, plus empty/loading/error/validation states. **Each new section/page below is a proposal requiring design approval; no layouts have been invented.**

**Global (`apps/web`)**
- [x] Homepage copy aligned to nonprofit mission (all sections, header, footer) — In progress, pending owner visual review (2026-10-12)
- [x] Homepage How It Works pill (For Churches / Join the Collection) — In progress
- [x] Homepage Gamo Live pill (Promote Event / Explore Events) — In progress
- [ ] Homepage **Church Partnerships** section (proposed) — how churches host classes, sponsor students/events, join the musician network and contribute to shared resources; no named partners until signed
- [ ] Homepage **Support Our Mission** section (proposed) — audiences: churches, sponsors, foundations, donors, community supporters; "contact us" interest only; no donation processing; legal-status statement required
- [ ] `/mission` (Our Mission: mission, vision, values, programs, legal status)
- [ ] `/partners` (Church Partnerships overview — participation pathways, no tiers/prices)
- [ ] `/partners/interest` (church partnership interest form — demo, no payment)
- [ ] `/support` (Opportunities to Support — sponsorship, in-kind, volunteering, future giving; donation processing disabled)
- [ ] `/contact` (general contact — referenced by homepage and footer)
- [ ] `/` dynamic hero spotlight — **requires explicit approval before any implementation**

**Live (`apps/live`)**
- [ ] `/promote` (Promote Event landing for churches, ministries, artists, organizers)
- [ ] `/organizer/events/new` (event submission, incl. recurring schedule)
- [ ] `/organizer/verification` (organizer identity & ticketing authorization status)
- [ ] `/organizer/events/[id]/promotion` (optional promotion request: website, social, partner communications, creative)
- [ ] `/organizer/events/[id]/report` (attendance, registrations, ticket and promotion report)
- [ ] `/events` filters (location, date, organizer, type, free/paid)
- [ ] `/organizers/[slug]` (church/artist/ministry profile & events, verified badge only if verified)
- [ ] `/events/[id]/register` (free registration)
- [ ] `/my-tickets` (attendee tickets & confirmations)

**Academy (`apps/academy`)**
- [ ] Sponsored / scholarship enrollment states (demo)
- [ ] Church host & sponsor interest form
- [ ] Parent/guardian-oriented lesson discovery copy pass

**Admin (`apps/admin`)**
- [ ] `/events` (moderation & approval queue, Christian-event policy checks)
- [ ] `/organizers` (organizer verification & ticketing authorization)
- [ ] `/promotions` (optional promotion intake and status)
- [ ] `/placements` (featured-placement scheduler, sponsored vs editorial vs Gamo program)
- [ ] `/ticketing` (ticketing oversight)
- [ ] `/partnerships` (church partnership records — no tiers)
- [ ] `/stewardship` (program ledger, funds, board reports — demo data)

**Production (`apps/production`)**
- [ ] Technical training & volunteer development page
- [ ] Event creative support page

**Existing screens flagged for nonprofit copy review (not yet edited):**
- `apps/worship` `/`, `/hire` (fee presentation must separate musician pay from any Gamo allocation)
- `apps/live` `/`, `/checkout`, `/organizer`
- `apps/academy` `/`, `/lessons`, `/host-apply`
- `apps/production` `/`, `/contact`
- `apps/admin` `/`, `/legal` (demo table shows "Published" for a contractor agreement — must read "Draft — pending counsel review")

## Shared Architecture
- [x] Tailwind config / UI tokens in all Astro apps
- [x] Shared layout structure (`Inter`, layout, global styles)

**Status:** Essential mock UI screens for Milestone 0 and visual prototypes for Milestones 1-4 exist. The global homepage copy has been aligned with the nonprofit mission and awaits visual review; nonprofit-specific pages above are proposed, not started.
