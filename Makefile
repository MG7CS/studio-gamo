.PHONY: help dev build check lint test images clean install status \
        dev-web dev-worship dev-academy dev-live dev-production dev-admin \
        deploy-web deploy-worship deploy-academy deploy-live deploy-production deploy-admin deploy-all \
        preview-web preview-worship preview-academy preview-live preview-production preview-admin preview-all \
        verify-deployment verify-config

# Default target
help:
	@echo "\033[1;34mGamo Studios Monorepo Commands\033[0m"
	@echo ""
	@echo "\033[1;32mDevelopment\033[0m"
	@echo "  \033[36mmake dev\033[0m               - Start the global website development server (apps/web)"
	@echo "  \033[36mmake dev-web\033[0m           - Start apps/web development server"
	@echo "  \033[36mmake dev-worship\033[0m       - Start apps/worship development server"
	@echo "  \033[36mmake dev-academy\033[0m       - Start apps/academy development server"
	@echo "  \033[36mmake dev-live\033[0m          - Start apps/live development server"
	@echo "  \033[36mmake dev-production\033[0m    - Start apps/production development server"
	@echo "  \033[36mmake dev-admin\033[0m         - Start apps/admin development server"
	@echo ""
	@echo "\033[1;32mBuild & Verification\033[0m"
	@echo "  \033[36mmake install\033[0m           - Install dependencies"
	@echo "  \033[36mmake build\033[0m             - Build all applications"
	@echo "  \033[36mmake check\033[0m             - Run TypeScript and Astro checks"
	@echo "  \033[36mmake lint\033[0m              - Run linting"
	@echo "  \033[36mmake test\033[0m              - Run tests"
	@echo "  \033[36mmake verify-deployment\033[0m - Dry-run deployment check across all applications"
	@echo "  \033[36mmake verify-config\033[0m     - Check Cloudflare CLI authentication and account"
	@echo ""
	@echo "\033[1;32mCloudflare Preview (workers.dev)\033[0m"
	@echo "  \033[36mmake preview-web\033[0m       - Deploy apps/web to workers.dev preview"
	@echo "  \033[36mmake preview-worship\033[0m   - Deploy apps/worship to workers.dev preview"
	@echo "  \033[36mmake preview-academy\033[0m   - Deploy apps/academy to workers.dev preview"
	@echo "  \033[36mmake preview-live\033[0m      - Deploy apps/live to workers.dev preview"
	@echo "  \033[36mmake preview-production\033[0m- Deploy apps/production to workers.dev preview"
	@echo "  \033[36mmake preview-all\033[0m       - Deploy public apps to workers.dev preview"
	@echo ""
	@echo "\033[1;32mCloudflare Production (gamostudio.org)\033[0m"
	@echo "  \033[36mmake deploy-web\033[0m        - Deploy apps/web to gamostudio.org"
	@echo "  \033[36mmake deploy-worship\033[0m    - Deploy apps/worship to worship.gamostudio.org"
	@echo "  \033[36mmake deploy-academy\033[0m    - Deploy apps/academy to academy.gamostudio.org"
	@echo "  \033[36mmake deploy-live\033[0m       - Deploy apps/live to live.gamostudio.org"
	@echo "  \033[36mmake deploy-production\033[0m - Deploy apps/production to production.gamostudio.org"
	@echo "  \033[36mmake deploy-admin\033[0m      - Deploy apps/admin to admin.gamostudio.org (Zero Trust)"
	@echo "  \033[36mmake deploy-all\033[0m        - Deploy all applications to production"
	@echo ""
	@echo "\033[1;32mAssets & Utilities\033[0m"
	@echo "  \033[36mmake images\033[0m            - Optimize images using the image optimization script"
	@echo "  \033[36mmake clean\033[0m             - Remove generated build artifacts"
	@echo "  \033[36mmake status\033[0m            - Show Git status"
	@echo ""

dev: dev-web

dev-web:
	@pnpm --filter apps-web run dev || echo "apps/web not available yet."

dev-worship:
	@pnpm --filter apps-worship run dev || echo "apps/worship not available yet."

dev-academy:
	@pnpm --filter apps-academy run dev || echo "apps/academy not available yet."

dev-live:
	@pnpm --filter apps-live run dev || echo "apps/live not available yet."

dev-production:
	@pnpm --filter apps-production run dev || echo "apps/production not available yet."

dev-admin:
	@pnpm --filter apps-admin run dev || echo "apps/admin not available yet."

install:
	@pnpm install

build:
	@pnpm run build

check:
	@pnpm run typecheck

lint:
	@pnpm run lint || echo "Lint script not configured yet."

test:
	@pnpm run test

images:
	@pnpm run images:optimize

clean:
	@find . -name "dist" -type d -prune -exec rm -rf '{}' + || true
	@find . -name ".astro" -type d -prune -exec rm -rf '{}' + || true
	@echo "Clean complete."

status:
	@git status

# Cloudflare Preview Targets
preview-web:
	@echo "Deploying apps/web to preview (workers.dev)..."
	@pnpm --filter apps-web exec wrangler deploy

preview-worship:
	@echo "Deploying apps/worship to preview (workers.dev)..."
	@pnpm --filter apps-worship exec wrangler deploy

preview-academy:
	@echo "Deploying apps/academy to preview (workers.dev)..."
	@pnpm --filter apps-academy exec wrangler deploy

preview-live:
	@echo "Deploying apps/live to preview (workers.dev)..."
	@pnpm --filter apps-live exec wrangler deploy

preview-production:
	@echo "Deploying apps/production to preview (workers.dev)..."
	@pnpm --filter apps-production exec wrangler deploy

preview-all: preview-web preview-worship preview-academy preview-live preview-production

# Cloudflare Production Targets
deploy-web:
	@echo "Deploying apps/web to production (gamostudio.org)..."
	@pnpm --filter apps-web exec wrangler deploy --env production

deploy-worship:
	@echo "Deploying apps/worship to production (worship.gamostudio.org)..."
	@pnpm --filter apps-worship exec wrangler deploy --env production

deploy-academy:
	@echo "Deploying apps/academy to production (academy.gamostudio.org)..."
	@pnpm --filter apps-academy exec wrangler deploy --env production

deploy-live:
	@echo "Deploying apps/live to production (live.gamostudio.org)..."
	@pnpm --filter apps-live exec wrangler deploy --env production

deploy-production:
	@echo "Deploying apps/production to production (production.gamostudio.org)..."
	@pnpm --filter apps-production exec wrangler deploy --env production

deploy-admin:
	@echo "Deploying apps/admin to production (admin.gamostudio.org)..."
	@pnpm --filter apps-admin exec wrangler deploy --env production

deploy-all: deploy-web deploy-worship deploy-academy deploy-live deploy-production deploy-admin

# Verification Targets
verify-deployment:
	@echo "Verifying Cloudflare deployment readiness (dry-run)..."
	@pnpm --filter apps-web exec wrangler deploy --dry-run
	@pnpm --filter apps-worship exec wrangler deploy --dry-run
	@pnpm --filter apps-academy exec wrangler deploy --dry-run
	@pnpm --filter apps-live exec wrangler deploy --dry-run
	@pnpm --filter apps-production exec wrangler deploy --dry-run
	@pnpm --filter apps-admin exec wrangler deploy --dry-run
	@echo "\033[1;32mAll 6 application deployment configurations verified successfully.\033[0m"

verify-config:
	@pnpm --filter apps-web exec wrangler whoami

.PHONY: api-lint api-bundle api-types api-docs api-check api-test
api-lint:
	@pnpm api:lint
api-bundle:
	@pnpm api:bundle
api-types:
	@pnpm api:types
api-docs:
	@pnpm api:docs
api-check:
	@pnpm api:check
api-test:
	@pnpm api:test
