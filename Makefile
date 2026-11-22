# WorkHub — local personal command center

SHELL := /bin/bash

.PHONY: run backend frontend build app install seed test demo

# Resolve Python from PATH instead of a developer-specific Homebrew location.
PYTHON := $(shell command -v python3)

## Backend helpers
BE := cd backend && .venv/bin/python

## Frontend helpers (npm scripts via vite)
FE := cd frontend && npm

## Start both backend + frontend (dev). Ctrl+C to stop both.
run:
	$(MAKE) -j2 backend frontend

## Start FastAPI backend on :8100 (override with BACKEND_PORT=8123)
backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port $${BACKEND_PORT:-8100}

## Start Vite dev server on :5273 (proxies /api -> :8100; override with FRONTEND_PORT=5275)
frontend:
	BACKEND_PORT=$${BACKEND_PORT:-8100} $(FE) run dev

## One-time setup: create venv, install backend deps + frontend deps
install:
	@test -n "$(PYTHON)" || (echo "Python 3 is required. Install it first."; exit 1)
	cd backend && rm -rf .venv
	cd backend && "$(PYTHON)" -m venv .venv
	cd backend && .venv/bin/python -m pip install --upgrade pip
	cd backend && .venv/bin/python -m pip install -r requirements.txt
	cd frontend && npm install

## Build the frontend and stage it into backend/static (for the installable app)
build:
	cd frontend && npm run build
	rm -rf backend/static
	mkdir -p backend/static
	cp -R frontend/dist/* backend/static/

## Serve the built, installable PWA from the backend on :8100 (single port).
## Chrome/Edge show the "Install WorkHub" icon (⊕) on this URL.
app: build
	cd backend && .venv/bin/uvicorn app.main:app --port $${BACKEND_PORT:-8100}

## Seed the database with sample/demo data
seed:
	$(BE) -m scripts.seed

## Run backend tests
test:
	$(BE) -m pytest tests -q

## Full demo: seed + run
demo: seed run
