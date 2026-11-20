-- 0022: level, lesson format and zip on an Academy registration (additive; owner-approved 2026-11-20).
-- People now register for a class on an instrument (program_slug), so a registration records the student's
-- level, whether they want one-on-one ('private') or 'group' lessons, and a five-digit zip code for finding
-- an instructor nearby. All three are nullable so older rows and callers are unaffected. The zip is personal
-- data: it is never put in emails or logs.
ALTER TABLE academy_registrations ADD COLUMN level TEXT CHECK (level IS NULL OR level IN ('beginner', 'developing', 'advancing'));
ALTER TABLE academy_registrations ADD COLUMN lesson_format TEXT CHECK (lesson_format IS NULL OR lesson_format IN ('private', 'group'));
ALTER TABLE academy_registrations ADD COLUMN zip TEXT CHECK (zip IS NULL OR length(zip) = 5);
