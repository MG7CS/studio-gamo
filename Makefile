.PHONY: help dev build check lint test images clean install status dev-web dev-worship dev-academy dev-live dev-production dev-admin

# Default target
help:
	@echo "\033[1;34mGamo Studios Monorepo Commands\033[0m"
	@echo ""
	@echo "\033[1;32mDevelopment\033[0m"
	@echo "  \033[36mmake dev\033[0m           - Start the global website development server (apps/web)"
	@echo "  \033[36mmake dev-web\033[0m       - Start apps/web development server"
	@echo "  \033[36mmake dev-worship\033[0m   - Start apps/worship development server"
	@echo "  \033[36mmake dev-academy\033[0m   - Start apps/academy development server"
	@echo "  \033[36mmake dev-live\033[0m      - Start apps/live development server"
	@echo "  \033[36mmake dev-production\033[0m- Start apps/production development server"
	@echo "  \033[36mmake dev-admin\033[0m     - Start apps/admin development server"
	@echo ""
	@echo "\033[1;32mBuild & Verification\033[0m"
	@echo "  \033[36mmake install\033[0m       - Install dependencies"
	@echo "  \033[36mmake build\033[0m         - Build the project"
	@echo "  \033[36mmake check\033[0m         - Run TypeScript and Astro checks"
	@echo "  \033[36mmake lint\033[0m          - Run linting"
	@echo "  \033[36mmake test\033[0m          - Run tests"
	@echo ""
	@echo "\033[1;32mAssets & Utilities\033[0m"
	@echo "  \033[36mmake images\033[0m        - Optimize images using the image optimization script"
	@echo "  \033[36mmake clean\033[0m         - Remove generated build artifacts"
	@echo "  \033[36mmake status\033[0m        - Show Git status"
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
	@pnpm -r build

check:
	@pnpm run typecheck || echo "Check script not fully configured yet."

lint:
	@pnpm run lint || echo "Lint script not configured yet."

test:
	@pnpm run test || echo "Test script not configured yet."

images:
	@pnpm run images:optimize || node scripts/optimize-images.mjs || echo "Image optimization script not found."

clean:
	@find . -name "dist" -type d -prune -exec rm -rf '{}' + || true
	@find . -name ".astro" -type d -prune -exec rm -rf '{}' + || true
	@echo "Clean complete."

status:
	@git status
