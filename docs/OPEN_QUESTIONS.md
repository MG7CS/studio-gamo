# Open questions for the owner

Written 2026-11-01. Every question the platform-layers work and the three requirements drafts left open, with the recommended answer for each. **Nothing here is decided until the Decision column says so.** Write your answer in that column (or tell the session "agree with all of Worship except 8 and 24"); the requirements documents are then updated and the question is marked decided.

Sources: [`WORSHIP_REQUIREMENTS.md`](WORSHIP_REQUIREMENTS.md) section 12, [`ACADEMY_REQUIREMENTS.md`](ACADEMY_REQUIREMENTS.md) section 11, [`PRODUCTION_REQUIREMENTS.md`](PRODUCTION_REQUIREMENTS.md) section 12, [`LIVE_TICKETING_REVIEW.md`](LIVE_TICKETING_REVIEW.md) sections 3 and 4. Anything marked counsel is a legal question; the recommendation only says what to do until counsel answers.

## Answers that apply to several products

| Topic | Recommended answer |
| --- | --- |
| Funds flow | Mode B first for Worship, Academy and Production, with Mode A kept in the interface for later. |
| Worker classification | Counsel reviews it before any real money moves. Free and sponsored work can launch earlier. |
| Retention | 90 days after the last date for personal details; counts and money records kept. |
| Sales tax | Not computed in v1. A counsel question. |
| Gamo allocation | Its own line, shown even at $0.00; every change a recorded decision. |

## Live

| # | Question | Recommended answer | Decision |
| --- | --- | --- | --- |
| 1 | Who carries dispute losses and refunds after a payout in Mode B? | The organization. Gamo nets them against future payouts and pays out only after the event date. | open |
| 2 | What happens when an organization's funds-flow mode changes after its Stripe account exists? | Lock the mode once the account exists. A change is an admin decision that sets up a new account. | open |
| 3 | Move refunds and emails for large cancellations to a queue (needs a Cloudflare Queue or cron)? | Approve it, but it is only needed before large events. Not a launch blocker. | open |
| 4 | The 23 proposals in the review file (section 3) | Keep all. Protect verified-to-sell, the fee coming back on refunds, and door sales after the start. | open |

## Worship

| # | Question | Recommended answer | Decision |
| --- | --- | --- | --- |
| 1 | Who sets the pay: requester within guidance, a Gamo rate card, or the musician? Any starting amounts? | The requester offers within guidance you publish. No amounts exist until you approve them. | open |
| 2 | When is the requester charged? | At confirmation; the musician is paid after completion. | open |
| 3 | Mode B only at first? | Yes. | open |
| 4 | Worker classification and year-end tax forms reviewed before real money? | Yes, counsel before real money. | open |
| 5 | Cancellation policy | Free until 72 hours before call time, otherwise musician pay is due. Never a Gamo allocation on canceled dates. | open |
| 6 | Is a standby paid when not activated, and what does the primary get when standby is used? | A smaller standby fee. A displaced primary keeps their pay unless they withdrew. | open |
| 7 | Consequence for late musician withdrawals? | None beyond admin-visible counts. | open |
| 8 | Must individuals and families have a verification meeting, or can the admin waive it? | No waiver. A short video call is enough for a family or one-off request. | open |
| 9 | Can a request be submitted before verification? | Yes. Nobody is proposed until the requester is verified. | open |
| 10 | Audition recordings as links only, and may musicians share them with requesters? | Links in v1; musicians may opt in to sharing. | open |
| 11 | References: required, optional, or not in v1? | Require one reference. | open |
| 12 | Do sound and media roles belong in Worship or Production? | Production. | open |
| 13 | Minors as musicians | Confirm not in v1 (safeguarding first). | open |
| 14 | Public musician directory | Confirm none in v1. | open |
| 15 | What requesters see of a musician before confirmation | Draft level: first name, last initial, skills, bio, opted-in recordings. | open |
| 16 | What musicians see of a request before being proposed | Draft level: no requester name or address on the public list. | open |
| 17 | "Invite a musician you already know" for requesters? | Later. | open |
| 18 | Confirmation deadlines | Keep the draft: 48 hours, or 12 hours when within three days. | open |
| 19 | Auto-complete and disputed dates | Keep the draft: auto-complete after 48 hours; the admin settles disputes by note. | open |
| 20 | Gifts or tips to the musician at payment | Not in v1. | open |
| 21 | Sponsorship of a small church's musician costs | Later. | open |
| 22 | Area names and URLs, and the word "Requester" | Drop "Requester" in the interface. Use `/requests` and `/musician`. | open |
| 23 | Instrument, voice and style lists | Accept the draft lists; review at build time. | open |
| 24 | Nationwide launch or named metros first? | Named metros first, where you can hold verification meetings. One coordinator cannot cover the whole country. | open |
| 25 | Retention | 90 days after a completed date; declined applicants removed after 90 days. | open |
| 26 | Requester and musician terms drafts | Write them alongside the build, labeled as drafts. | open |

## Academy

| # | Question | Recommended answer | Decision |
| --- | --- | --- | --- |
| 1 | Learner accounts, or learners and guardians without an account? | No accounts in v1. | open |
| 2 | Who creates classes? Should "review every class" relax later? | Instructors propose, the admin reviews every class. Relax per instructor after their first approved class. | open |
| 3 | Private lessons as capacity-1 weekly slots? | Yes. Choose-your-own-time, rescheduling and make-ups later. | open |
| 4 | Screening provider for instructors teaching minors | An offline screening recorded by the admin, no new provider. Required only for instructors teaching minors. | open |
| 5 | Safeguarding policy: who writes it, and may adult-only classes launch before it is approved? | You and counsel write it. Adult-only classes may launch first; classes for minors stay off until it is approved. | open |
| 6 | Money flow: instructor as payee, or Gamo as seller of record? | Instructor as payee, Mode B first. | open |
| 7 | Can paid classes launch before counsel reviews instructor classification? | Free and sponsored classes launch now; paid ones after counsel. | open |
| 8 | Show the Gamo allocation to the learner at $0, or hide it? | Show the line at $0.00. | open |
| 9 | Are sponsorship payments ever online? What receipt may a sponsor get? | Record sponsorships offline through the admin. The receipt names the recipient and makes no tax claim. | open |
| 10 | Partial sponsorship in v1? | Sponsor all places or N places. A fixed amount comes later. | open |
| 11 | Need-based support requests | Later. | open |
| 12 | Pricing unit | Per learner per term. Monthly lessons later. | open |
| 13 | Refund options | Full refund until 3, 7 or 14 days before the first session. No pro-rating. | open |
| 14 | May a class accept under 6? | No, not in v1. | open |
| 15 | Must a guardian stay on site for the youngest bands? | Yes, under age 10. | open |
| 16 | What instructors see of a minor's family | Guardian name and phone, never email. | open |
| 17 | Online classes in v1, and for minors? | In person only in v1. | open |
| 18 | Locations reviewed separately, or with the first class that uses them? | With the first class that uses them. | open |
| 19 | May a verified instructor teach at a not-yet-verified church? | No. | open |
| 20 | Which production tracks exist at launch, and who teaches them? | Audio and video or livestream, taught by verified Production technicians. Lighting later. | open |
| 21 | Keep `/lessons` or rename to `/classes`? | Keep `/lessons`. | open |
| 22 | One organization record across products | Confirm: a church verified for Live is verified for Academy. | open |
| 23 | Retention of minors' attendance records | Counsel decides the period. | open |
| 24 | Emails per session | Only a day-before reminder; attendance notes on the manage page. | open |
| 25 | Academy's own Clerk application | Yes. Keys, DNS and CSP origins come from you at build time. | open |
| 26 | A new Academy-owned database | Yes, created by you. | open |
| 27 | Sales tax on tuition | Counsel. | open |

## Production

| # | Question | Recommended answer | Decision |
| --- | --- | --- | --- |
| 1 | Who may ask without an account? | An emailed code, no account. | open |
| 2 | Who is the client? | Churches and ministries first. Live organizers and Christian artists are fine. Others later. | open |
| 3 | Training handoff | Close the request automatically and send the person to Academy. Keep the record in Production only. | open |
| 4 | Link from a Live event page | Yes, "Request production support" with the event prefilled. | open |
| 5 | Does Gamo place technicians in v1? | Launch consultation, facility guidance and a support-request intake. Automated placement and technician pay come once Worship's payment flow is proven. | open |
| 6 | Technicians paid, volunteer, or both? | Both. Volunteer means a $0 position chosen per assignment. | open |
| 7 | Who pays the technician? | Mode B transfers to each technician. | open |
| 8 | Placement before counsel reviews contractor classification? | No. | open |
| 9 | Gamo allocation shape; cost-recovery on consultations? | Both a fixed amount and a percentage, starting at $0. Consultations stay free. | open |
| 10 | Cancellation terms for an accepted proposal | Mirror Worship: full refund outside 72 hours; the technician is paid on a late cancellation. | open |
| 11 | Sales tax on services | Counsel. | open |
| 12 | Client document upload | Admin-shared documents only in v1. | open |
| 13 | What clients and technicians see of each other | Agree with the draft. | open |
| 14 | Safety and insurance requirements | A safety contact per engagement; technicians may decline unsafe work. Counsel for insurance. | open |
| 15 | May recommendations name brands? | Categories and criteria only. | open |
| 16 | Project stories | Written permission from the church; Gamo drafts, the church approves. None at launch, since none exist yet. | open |
| 17 | One Production database, or shared with Worship? | One Production database. | open |
| 18 | Admin placement | One admin area called "Programs" with a tab each for Worship, Academy and Production. A separate area for each would push the sidebar past six. | open |
| 19 | Public wording | Say "request", "consultation" and "plan". Keep "engagement" internal. | open |
| 20 | Retention | 90 days after close for personal data. | open |
