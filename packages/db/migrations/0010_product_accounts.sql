ALTER TABLE sessions ADD COLUMN product TEXT;
--> statement-breakpoint
CREATE TABLE product_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product TEXT NOT NULL CHECK (product IN ('web', 'worship', 'academy', 'live', 'production')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  onboarding_status TEXT NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending', 'completed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX product_account_user_product_unique ON product_accounts(user_id, product);
--> statement-breakpoint
CREATE INDEX product_account_user_idx ON product_accounts(user_id);
--> statement-breakpoint
CREATE INDEX product_account_product_idx ON product_accounts(product);
--> statement-breakpoint
INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at)
SELECT 'pacc_worship_' || u.id, u.id, 'worship', 'active', 'completed', u.created_at, u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM musician_profiles mp WHERE mp.user_id = u.id)
   OR EXISTS (SELECT 1 FROM churches c WHERE c.contact_user_id = u.id);
--> statement-breakpoint
INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at)
SELECT 'pacc_academy_' || u.id, u.id, 'academy', 'active', 'completed', u.created_at, u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM instructor_profiles ip WHERE ip.user_id = u.id)
   OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_user_id = u.id OR e.guardian_user_id = u.id);
--> statement-breakpoint
INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at)
SELECT 'pacc_live_' || u.id, u.id, 'live', 'active', 'completed', u.created_at, u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM artist_profiles ap WHERE ap.user_id = u.id)
   OR EXISTS (SELECT 1 FROM artist_representatives ar WHERE ar.user_id = u.id)
   OR EXISTS (SELECT 1 FROM event_team_members etm WHERE etm.user_id = u.id)
   OR EXISTS (SELECT 1 FROM event_registrations er WHERE er.user_id = u.id)
   OR EXISTS (SELECT 1 FROM ticket_orders to_ord WHERE to_ord.purchaser_user_id = u.id)
   OR EXISTS (SELECT 1 FROM organization_members om INNER JOIN organizer_profiles op ON op.organization_id = om.organization_id WHERE om.user_id = u.id);
--> statement-breakpoint
INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at)
SELECT 'pacc_production_' || u.id, u.id, 'production', 'active', 'completed', u.created_at, u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM production_requests pr WHERE pr.contact_user_id = u.id);
--> statement-breakpoint
INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at)
SELECT 'pacc_web_' || u.id, u.id, 'web', 'active', 'completed', u.created_at, u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM participation_inquiries pi WHERE pi.user_id = u.id)
   OR NOT EXISTS (SELECT 1 FROM product_accounts pa WHERE pa.user_id = u.id);
