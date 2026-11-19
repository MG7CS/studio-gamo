# Child Image and Consent Policy

> **DRAFT for owner review (2026-11-18): not final, not legal advice, has not been reviewed by a lawyer.**
> Nothing here says that Gamo Studios has completed safeguarding checks, signed partner agreements, hired staff for the roles below or handled any incident. Every role, number and form in this draft is a proposal.

Related: [AGENTS.md](../AGENTS.md) (mission, copy and honesty rules), [GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md) §4 Academy safeguarding (file name historical: Gamo is a Public Benefit Corporation), [DECISIONS.md](DECISIONS.md) (photo entries of 2026-11-18), [ASSET_MANIFEST.md](ASSET_MANIFEST.md), [SECURITY.md](../SECURITY.md).

## 1. Purpose and scope

Gamo Academy teaches children, teens and adults. Gamo Worship and Gamo Production work in churches, where children are often present. This policy says which images of children Gamo may show, how Gamo asks for consent, and what happens when someone asks for an image to be removed.

It covers:

- every Gamo website (web, Academy, Worship, Production, admin);
- emails, printed material and any social media account Gamo runs;
- photos, video and audio recordings, AI-generated images and stock photos;
- staff, instructors, musicians, technicians and volunteers acting for Gamo.

It does not replace the Academy Guardian Consent and Child-Safety Consent documents. Those are separate drafts that also need legal review.

## 2. Definitions

- **Child:** anyone under 18. "Young child" means under 13. "Teen" means 13 to 17.
- **Illustration:** an image that shows the idea of an activity, not a real Gamo student, family, event or partner. Stock photos and AI-generated images on the sites are illustrations.
- **Real photo:** a photo, video or recording of an actual person taken at or for a Gamo lesson, service or event.
- **AI-generated image:** an image made by an image-generation tool. It may look like a photo. It shows no real person and no real event.
- **Profile:** a page or card about one named person (an instructor, musician or technician). Today the Academy instructor pages are fictional samples labelled "Sample instructor profile" and show initials, not photos (`apps/academy/src/pages/instructors/[slug].astro`).

## 3. What may appear

### Allowed

- AI or stock illustrations of children doing safe, everyday activities: playing an instrument, listening, practising, in a classroom, home or church room, fully clothed.
- Hands on an instrument, instruments alone, music stands, sheet music.
- Children seen from behind, or from far away in a group, with no face in focus.
- Real photos of a child only with the written consent described in section 5, and only for the uses that consent names.

### Never allowed

- Any image of a child in a private or compromising setting: bathrooms, changing areas, bedrooms, swimwear, sleepwear, partial dress, or poses that could be read as sexual.
- A child's name (first or full) next to a photo of that child.
- A child's location, school name, home area, lesson time, schedule or regular routine, alongside an image.
- Uniforms, badges, name tags or signs that identify a child's school or church, in any image published with a child.
- Any real child's photo, video or recording without written consent from a parent or legal guardian.
- AI images or stock photos presented as real Gamo students, real lessons, real events or real families.
- Images of a child who is upset, hurt, being disciplined, or in a medical or distressing situation.
- Geotags or location metadata in any published image file.

## 4. AI illustrations

Owner rules (2026-11-18): AI images are used only as illustrations; never on a musician profile; a profile always shows only the person it is about, with consent; for children only appropriate, safe images are used.

- An AI image is always an illustration. Captions, alt text, headings and surrounding copy must not describe it as a real student, a real lesson, a real instructor or a real church.
- AI images are never used on a lesson's instructor section, an instructor profile, a musician profile or a technician profile.
- AI images of children follow section 3 like any other image.
- No AI image is generated from, or edited to look like, a real child.
- Alt text describes what is shown ("Young pianist at a keyboard"), not a story about who the person is.

**Labelling approach (proposal).** Add one short "About our photos" statement, linked from the footer or the legal index, rather than a caption on every image. Proposed wording for the owner to edit and counsel to check:

> Photos on our sites show the kind of teaching and service we offer. Some are stock photos and some are AI-generated illustrations. They do not show our students, families, instructors or partner churches unless the caption says so.

Option for counsel: add a short "Illustration" note under hero images that show children. The partners page already uses a similar sentence: "Photography illustrates the mission; it does not identify an existing partner." (`apps/web/src/pages/partners/index.astro`).

## 5. Real photos or video of children

Gamo does not take or publish real photos of children today. If that changes:

**Consent first.** A parent or legal guardian gives written consent **before** anything is captured, and confirms again **before** a specific image is published. Consent for registration does not cover photos. The current draft consent documents already say this: "No photos or recordings of a student are taken or shared without the parent or guardian's separate consent" (`packages/ui/src/components/legal/content/academy-child-safety-consent.ts`; see also `academy-guardian-consent.ts`).

**The consent form must say:**

- what will be captured (photo, video, audio);
- where it may appear (each site, email, print, social media), each as a separate tick box;
- how long it will stay published and how long Gamo keeps the file;
- who can see it (public, or staff only);
- that the child's name will not be published with it;
- that no payment or benefit is given, and that saying no does not affect lessons, fees, scholarships or placement;
- how to withdraw consent, and what happens to copies already shared.

**Partner churches.** Sharing an image with a church (for its website, bulletin or social media) needs a separate tick box. Gamo gives the church only the approved image and asks it to follow the same rules. Gamo has no partner church agreements today.

**Minimum necessary.** Prefer hands, instruments, backs and groups. Publish the fewest images needed. Crop out faces of other children who have no consent.

**Devices.** Instructors, musicians and volunteers do not take photos or video of children on personal phones or devices. Capture uses a Gamo-controlled device or account, by a person the approver has named.

**Storage and access.** Originals and consent records are stored in one Gamo-controlled location with access limited to the approver and the safeguarding contact. Metadata (including location) is removed before publishing. Images are never sent through personal messaging apps. Uploads through Gamo forms go to private storage served to staff only (forms spec, `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`, "Uploads").

**Retention (proposal).** Unpublished originals: delete 12 months after capture. Published images: review at each quarterly audit and remove after 2 years unless consent is renewed. Consent records: keep as long as the image is kept, plus a period counsel sets.

**Removal on request (proposal: 3 business days).** When a parent, guardian or the teen asks, Gamo removes the image from every Gamo site, email template and Gamo social account within 3 business days, and within 24 hours if there is a safety concern. Why 3 days: the sites are small, images are in one catalog, and one person can remove an image and redeploy in a day; 3 business days allows for weekends and a second check. Counsel may suggest a different number.

**Copies already shared.** Gamo cannot recall copies others have saved. Gamo will ask each partner church or outlet it shared with to delete the image, record the request and tell the family what was done. The consent form says this plainly.

## 6. Teens 13 to 17

- A parent or legal guardian gives written consent, as in section 5.
- The teen also agrees (assent), in writing or recorded by the approver, in plain words.
- If the teen says no, the image is not taken or used, even with guardian consent.
- Either the teen or the guardian can withdraw at any time.

## 7. Online collection of children's information

**What the Academy registration form collects today** (from `apps/academy/src/components/registration/StudentFields.astro`, `ContactFields.astro`, `ConsentFields.astro`, and `apps/academy/src/pages/register/[lesson].astro`):

- the student's first name only ("First name only");
- an age group, not a birth date ("We ask for an age group only, never a birth date"): Under 6, 6–9, 10–12, 13–15, 16–17, 18 or older (`packages/domain/src/services/academy-registrations.ts`);
- for a student under 18: the parent or guardian's full name, email and phone;
- acceptance of Enrollment Terms and Privacy Policy, and, for under 18, the Guardian Consent and Child-Safety Consent drafts (the form states they "still require legal review");
- an optional, unticked marketing opt-in;
- a hashed IP address for abuse limits (the form guard), and a Cloudflare Turnstile check.

No accounts exist. Families get emailed manage links (`AGENTS.md`, "Forms, emails and admin"). The database stores an age band, not a birth date (`packages/db/migrations/0012_identity_terms_customers.sql`). Staff-editable forms can include photo, video and PDF upload questions (forms spec); a form aimed at children or families must not ask for a child's photo unless section 5 is met.

**US children's online privacy rule.** The Children's Online Privacy Protection Act (COPPA) and the Federal Trade Commission's rule under it set requirements for websites that collect personal information online from children under 13. The FTC amended the rule in 2025. The forms spec says "Academy stays parent-completed (COPPA)". Counsel must confirm whether and how the rule applies to Gamo's forms, emails, Turnstile and any future photo uploads. This draft makes no claim that Gamo complies.

## 8. Roles (proposed; the owner assigns people)

- **Image approver:** the Academy program director (or the owner until one is named). Approves every image involving a child before it is published.
- **Second reviewer:** a different person (for example the safeguarding contact). Two people sign off on any image of a child, real or illustration.
- **Safeguarding contact:** one named person families can write to about images, consent or concerns, listed on the consent form and the "About our photos" statement.
- **Quarterly image audit:** the approver and second reviewer check every image of a child on every Gamo site and account, against the table below and this policy, and record the result in `docs/BUILD_LOG.md` or a private log.

## 9. Checklist before publishing any image involving a child

1. Is it a real photo or an illustration? Record which.
2. If real: is there signed guardian consent (and teen assent) that covers this exact use and place?
3. Does it meet every "Allowed" rule and break no "Never allowed" rule in section 3?
4. No name, school, location, schedule or uniform shown or written near it?
5. Location and other metadata removed?
6. Alt text and caption describe the image without calling an illustration a real student?
7. Not on a profile, unless it is a real photo of that adult with their consent?
8. Licence or source recorded in `docs/ASSET_MANIFEST.md`?
9. Approver and second reviewer both signed off, with the date?

## 10. Incident and takedown handling

1. Anyone (family, staff, public) can report a concern to the safeguarding contact.
2. If there is any safety concern, take the image down first, within 24 hours, then review.
3. Otherwise remove within the stated period (proposal: 3 business days).
4. Ask anyone Gamo shared the image with to delete it.
5. Tell the person who reported what was done.
6. Record the date, image, reason and actions in a private log (no child's name in public logs or emails, as `AGENTS.md` already requires).
7. If the concern involves possible harm to a child, follow the law and counsel's guidance on reporting to authorities.
8. Review at the next audit whether the policy needs a change.

## Where this applies on the site today

From the code on 2026-11-18. Image descriptions come from the catalog alt text (`packages/ui/src/lib/images.ts`) and `docs/ASSET_MANIFEST.md`, not from a fresh visual check. The original photo set is AI-generated (`docs/ASSET_INVENTORY_2026.md`; DECISIONS 2026-11-18 notes the owner accepted that it "includes a child").

| Page | File | Children or teen ages shown | Images used |
| --- | --- | --- | --- |
| Academy home `/` | `apps/academy/src/pages/index.astro`, `components/home/AcademyHero.astro`, `LearningPaths.astro`, `HowLessonsWork.astro`, `InstructionFormats.astro`, `SponsoredPrograms.astro` | Age cards "Kids (6–12)", "Teens (13–17)", "Adults" | `boyGuitar`, `girlGuitar`, `youngPianist`, `guitarMentor` (AI; boy, girl, young pianist, instructor with young student) |
| Academy instruments `/instruments` | `apps/academy/src/pages/instruments/index.astro` | No | `youngPianist` hero, `guitarMentor` closing image |
| Academy lesson `/lessons/[slug]` | `apps/academy/src/pages/lessons/[slug].astro`, `src/data/lessons.ts` | Sample lessons for Kids/Teens, e.g. "children ages 6–10", "Teen Guitar Circle" | instrument photo (free-licence instrument close-ups), fallback `guitarMentor` |
| Academy sponsored `/sponsored` | `apps/academy/src/pages/sponsored.astro` | Families, sponsored students | `boyGuitar` hero |
| Academy register `/register/[lesson]` | `apps/academy/src/pages/register/[lesson].astro` | Age groups Under 6 to 16–17 | none |
| Academy instructor `/instructors/[slug]` | `apps/academy/src/pages/instructors/[slug].astro` | No | initials only, "Sample" badge |
| Web home `/` | `apps/web/src/pages/index.astro`, `components/organization/PathChooser.astro`, `data/organization.ts` | "children, teens and adults" | `boyGuitar` (hero, a boy playing guitar), `girlGuitar` (Students & families card) |
| Web get started `/get-started` | `apps/web/src/pages/get-started.astro` | via PathChooser | `girlGuitar` |
| Web get involved, mission, support | `apps/web/src/pages/get-involved.astro`, `mission.astro`, `support.astro` | No | `guitarMentor`; `girlGuitar` (support hero; mission via `ProgramsShowcase` and `data/programs.ts`) |
| Worship home `/` | `apps/worship/src/components/home/JoinSection.astro` | No | `guitarMentor` |
| Private catalog previews | `apps/web/src/components/catalog/ContentCatalog.astro`, `FramesCatalog.astro` | No | all four child images, some labelled "Sample" |

The header menu tiles use free-licence instrument, musician and technical photos (`packages/config/menus.ts`); the first audit should confirm none shows a child.

## 11. Parent or guardian consent form (template)

> **TEMPLATE, DRAFT: not for use until reviewed by counsel.**

**Gamo Academy: Photo and Recording Consent**

Student first name: ______________________  Age group: ________

Parent or legal guardian full name: ______________________

Email: ______________________  Phone: ______________________

Gamo Studios would like to take photos, video or audio recordings of your child at: ______________________ (lesson, recital or event) on or around ____________ (date).

**What may be captured** (tick each you agree to):
☐ Photos  ☐ Video  ☐ Audio only  ☐ Hands and instrument only (no face)

**Where it may be shown** (tick each you agree to):
☐ Gamo websites  ☐ Gamo emails  ☐ Printed Gamo material  ☐ Gamo social media accounts
☐ Shared with the church that hosts the lesson: ______________________ (church name)
☐ Kept private for Gamo staff only (not published)

**How long:** published for up to ____ months; the file is kept for up to ____ months, then deleted.

**What we promise:**

- Your child's name, school, location and schedule will not be published with any image.
- We will show you the images we choose before publishing them.
- No one is paid for this consent, and saying no does not affect lessons, fees, scholarships or placement.
- Photos are taken on Gamo-controlled devices only, never an instructor's personal phone.

**Changing your mind:** you or your child can withdraw at any time by writing to ______________________ (safeguarding contact email). We will remove the images from Gamo sites and accounts within ____ business days. We will ask anyone we shared them with to delete them, but we cannot recall copies others have already saved.

**Teen agreement (ages 13–17):** I understand this form and I agree. ☐ Yes ☐ No
Student signature: ______________________ Date: ________

**Parent or guardian:** I am the parent or legal guardian of this student and I agree to the choices ticked above.
Signature: ______________________ Date: ________

*For Gamo use:* Approved by ______________________ and ______________________ on ________.

## 12. Open questions

For the owner:

1. Who is the image approver, the second reviewer and the safeguarding contact?
2. Should the current AI images of children (`boyGuitar`, `girlGuitar`, `youngPianist`, `guitarMentor`) stay, be replaced with hands-and-instrument images, or be kept only where faces are not the focus?
3. Approve the "About our photos" wording, and where it lives (footer, legal index, or both)?
4. Will Gamo ever publish real photos of students, or keep illustrations only for now?
5. Is 3 business days (24 hours for safety concerns) the right removal period?
6. Are the proposed retention periods (12 months unpublished, 2 years published) acceptable?
7. Will Gamo run social media accounts, and who posts?

For legal counsel:

1. Does COPPA (as amended in 2025) apply to the Academy registration form, emails, Turnstile and future uploads, and what changes are needed?
2. What Arizona laws apply to images of minors, consent by guardians, and teen assent?
3. Is a signed paper or electronic form enough, and how long must consent records be kept?
4. Does Gamo's insurance need to cover photography of minors or image-related claims?
5. What should a partner church agreement require about images of children?
6. Should anyone who photographs children for Gamo pass a background check, and through which provider?
7. Does the "About our photos" statement or AI labelling need specific wording under federal or Arizona rules?
8. What reporting duties apply if an image-related concern suggests harm to a child?
