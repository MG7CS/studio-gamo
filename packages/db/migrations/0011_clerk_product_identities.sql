ALTER TABLE product_accounts ADD COLUMN clerk_app_id TEXT;
--> statement-breakpoint
ALTER TABLE product_accounts ADD COLUMN clerk_user_id TEXT;
--> statement-breakpoint
ALTER TABLE product_accounts ADD COLUMN clerk_issuer TEXT;
--> statement-breakpoint
ALTER TABLE product_accounts ADD COLUMN clerk_linked_at INTEGER;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS product_account_clerk_product_user_unique ON product_accounts(product, clerk_user_id) WHERE clerk_user_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_account_clerk_user_idx ON product_accounts(clerk_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS clerk_identity_links (
  id TEXT PRIMARY KEY NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('web', 'worship', 'academy', 'live', 'production')),
  clerk_app_id TEXT NOT NULL,
  clerk_issuer TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  clerk_email TEXT NOT NULL,
  clerk_email_verified INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_account_id TEXT NOT NULL REFERENCES product_accounts(id) ON DELETE CASCADE,
  migration_source TEXT NOT NULL DEFAULT 'clerk_registration' CHECK (migration_source IN ('clerk_registration', 'verified_domain_claim', 'admin_migration')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  linked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clerk_identity_product_user_unique ON clerk_identity_links(product, clerk_user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clerk_identity_issuer_user_unique ON clerk_identity_links(clerk_issuer, clerk_user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clerk_identity_product_account_unique ON clerk_identity_links(product_account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clerk_identity_user_idx ON clerk_identity_links(user_id, product);
