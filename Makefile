.PHONY: up down logs test test-services dashboard-build dev smee

up:
	@test -f .env || cp .env.example .env
	docker compose up -d --build
	@echo "Dashboard http://localhost:3000   API http://localhost:8000   Setup http://localhost:8000/api/setup"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100 api worker dashboard

# Throwaway postgres/redis on the ports the tests default to (TEST_DATABASE_URL / TEST_REDIS_URL).
test-services:
	@docker start jev-test-pg >/dev/null 2>&1 || docker run -d --name jev-test-pg -e POSTGRES_USER=jev -e POSTGRES_PASSWORD=jev -e POSTGRES_DB=jev -p 55432:5432 postgres:16-alpine
	@docker start jev-test-redis >/dev/null 2>&1 || docker run -d --name jev-test-redis -p 56379:6379 redis:7-alpine

test:
	cd backend && uv run pytest -q

dashboard-build:
	cd dashboard && pnpm install --frozen-lockfile && pnpm build

# Backend and dashboard on the host, postgres + redis in compose.
dev:
	@test -f .env || cp .env.example .env
	@test -e backend/.env || ln -s ../.env backend/.env
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
	@echo "In separate terminals:"
	@echo "  cd backend && uv run uvicorn app.main:app --reload"
	@echo "  cd backend && uv run python -m app.worker"
	@echo "  cd dashboard && API_URL=http://localhost:8000 pnpm dev"

# Forward GitHub webhooks to a local API. Set SMEE_URL (https://smee.io/new).
smee:
	@test -n "$(SMEE_URL)" || (echo "set SMEE_URL=https://smee.io/<channel>" && exit 1)
	npx smee-client --url $(SMEE_URL) --target http://localhost:8000/api/github/webhook
