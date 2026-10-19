.PHONY: help dev dev-all build check typecheck format lint test images print clean install status \
        dev-web dev-worship dev-academy dev-live dev-production dev-admin open-all \
        deploy-web deploy-worship deploy-academy deploy-live deploy-production deploy-all \
        preview-web preview-worship preview-academy preview-live preview-production preview-all \
        verify-deployment verify-config

# Default target
help:
	@echo "\033[1;34mGamo Studios Monorepo Commands\033[0m"
	@echo ""
	@echo "\033[1;32mDevelopment\033[0m"
	@echo "  \033[36mmake dev\033[0m               - Start the global website development server (apps/web)"
	@echo "  \033[36mmake dev-all\033[0m           - Start all 6 application development servers concurrently"
	@echo "  \033[36mmake open-all\033[0m          - Open all 6 local sites in the browser (run after make dev-all)"
	@echo "  \033[36mmake dev-web\033[0m           - Start apps/web development server"
	@echo "  \033[36mmake dev-worship\033[0m       - Start apps/worship development server"
	@echo "  \033[36mmake dev-academy\033[0m       - Start apps/academy development server"
	@echo "  \033[36mmake dev-live\033[0m          - Start apps/live development server"
	@echo "  \033[36mmake dev-production\033[0m    - Start apps/production development server"
	@echo "  \033[36mmake dev-admin\033[0m         - Start apps/admin development server (http://127.0.0.1:4326)"
	@echo ""
	@echo "\033[1;32mBuild & Verification\033[0m"
	@echo "  \033[36mmake install\033[0m           - Install dependencies"
	@echo "  \033[36mmake build\033[0m             - Build all applications"
	@echo "  \033[36mmake check\033[0m             - Run everything CI runs (typecheck, lint, format, tests, API contract, build)"
	@echo "  \033[36mmake typecheck\033[0m         - Type-check apps (astro check), packages and scripts"
	@echo "  \033[36mmake format\033[0m            - Format the workspace with Prettier"
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
	@echo "  \033[36mmake deploy-all\033[0m        - Deploy all applications to production"
	@echo ""
	@echo "\033[1;32mAssets & Utilities\033[0m"
	@echo "  \033[36mmake images\033[0m            - Optimize images using the image optimization script"
	@echo "  \033[36mmake print\033[0m             - Build the print-ready booklet PDF into ~/Downloads (design-reference/make_print_pdf.mjs)"
	@echo "  \033[36mmake clean\033[0m             - Remove generated build artifacts"
	@echo "  \033[36mmake status\033[0m            - Show Git status"
	@echo ""

dev: dev-web

dev-all:
	@pnpm run dev:all

open-all:
	@for port in 4321 4322 4323 4324 4325 4326; do open http://127.0.0.1:$$port; done

dev-web:
	@pnpm --filter apps-web run dev

dev-worship:
	@pnpm --filter apps-worship run dev

dev-academy:
	@pnpm --filter apps-academy run dev

dev-live:
	@pnpm --filter apps-live run dev

dev-production:
	@pnpm --filter apps-production run dev

dev-admin:
	@pnpm --filter apps-admin run dev

install:
	@pnpm install

build:
	@pnpm run build

check:
	@pnpm run check

typecheck:
	@pnpm run typecheck

format:
	@pnpm run format

lint:
	@pnpm run lint

test:
	@pnpm run test

images:
	@pnpm run images:optimize

# Booklet: 16 single 8.5x11in pages -> ~/Downloads/gamo-studios-booklet-print.pdf
# Extra options: make print ARGS="--cmyk" (or --out PATH, --html PATH)
print:
	@node design-reference/make_print_pdf.mjs $(ARGS)

clean:
	@find . -name "dist" -type d -prune -exec rm -rf '{}' + || true
	@find . -name ".astro" -type d -prune -exec rm -rf '{}' + || true
	@echo "Clean complete."

status:
	@git status

# Cloudflare Preview Targets
preview-web:
	@echo "Building and deploying apps/web to preview (workers.dev)..."
	@CLOUDFLARE_ENV=preview pnpm --filter apps-web build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-web exec wrangler deploy

preview-worship:
	@echo "Building and deploying apps/worship to preview (workers.dev)..."
	@CLOUDFLARE_ENV=preview pnpm --filter apps-worship build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-worship exec wrangler deploy

preview-academy:
	@echo "Building and deploying apps/academy to preview (workers.dev)..."
	@CLOUDFLARE_ENV=preview pnpm --filter apps-academy build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-academy exec wrangler deploy

preview-live:
	@echo "Building and deploying apps/live to preview (workers.dev)..."
	@CLOUDFLARE_ENV=preview pnpm --filter apps-live build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-live exec wrangler deploy

preview-production:
	@echo "Building and deploying apps/production to preview (workers.dev)..."
	@CLOUDFLARE_ENV=preview pnpm --filter apps-production build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-production exec wrangler deploy

preview-all: preview-web preview-worship preview-academy preview-live preview-production

# Cloudflare Production Targets
deploy-web:
	@echo "Building and deploying apps/web to production (gamostudio.org)..."
	@CLOUDFLARE_ENV=production pnpm --filter apps-web build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-web exec wrangler deploy

deploy-worship:
	@echo "Building and deploying apps/worship to production (worship.gamostudio.org)..."
	@CLOUDFLARE_ENV=production pnpm --filter apps-worship build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-worship exec wrangler deploy

deploy-academy:
	@echo "Building and deploying apps/academy to production (academy.gamostudio.org)..."
	@CLOUDFLARE_ENV=production pnpm --filter apps-academy build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-academy exec wrangler deploy

deploy-live:
	@echo "Building and deploying apps/live to production (live.gamostudio.org)..."
	@CLOUDFLARE_ENV=production pnpm --filter apps-live build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-live exec wrangler deploy

deploy-production:
	@echo "Building and deploying apps/production to production (production.gamostudio.org)..."
	@CLOUDFLARE_ENV=production pnpm --filter apps-production build
	@CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-production exec wrangler deploy

deploy-all: deploy-web deploy-worship deploy-academy deploy-live deploy-production

# Verification Targets
verify-deployment:
	@echo "Verifying Cloudflare deployment readiness (dry-run)..."
	@pnpm --filter apps-web exec wrangler deploy --dry-run
	@pnpm --filter apps-worship exec wrangler deploy --dry-run
	@pnpm --filter apps-academy exec wrangler deploy --dry-run
	@pnpm --filter apps-live exec wrangler deploy --dry-run
	@pnpm --filter apps-production exec wrangler deploy --dry-run
	@echo "\033[1;32mAll 5 application deployment configurations verified successfully.\033[0m"

verify-config:
	@pnpm --filter apps-web exec wrangler whoami
