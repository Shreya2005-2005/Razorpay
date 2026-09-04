# Contributing

## Project layout

```
backend/    FastAPI service (Python 3.13)
frontend/   Next.js app (React 19, TypeScript)
docs/       Architecture and other reference docs
```

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Backend setup

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # then fill in GROQ_API_KEY, RAZORPAY_KEY_ID/SECRET
venv/bin/uvicorn main:app --reload
```

Run tests, lint, and formatting locally exactly as CI does:

```bash
venv/bin/pytest -v --cov=. --cov-report=term-missing
venv/bin/ruff check .
venv/bin/black --check .
```

`ruff check --fix .` and `black .` will fix most issues automatically.

## Frontend setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # if present; otherwise set NEXT_PUBLIC_API_BASE_URL
npm run dev
```

Run tests, lint, and formatting locally exactly as CI does:

```bash
npm run lint
npm run format:check
npx next typegen && npx tsc --noEmit
npm run test -- --run
```

`npm run format` fixes formatting issues automatically.

## Pre-commit hooks

This repo uses [pre-commit](https://pre-commit.com/) to run Black, Ruff,
ESLint, and Prettier on staged files before every commit, so badly
formatted or failing-lint code never gets committed.

```bash
pip install pre-commit   # or: backend/venv/bin/pip install pre-commit
pre-commit install
```

After that, `git commit` runs the hooks automatically. To run them against
the whole repo once (e.g. after first installing):

```bash
pre-commit run --all-files
```

## Before opening a PR

1. Both test suites pass locally (see above) — CI blocks merging on either
   failing.
2. New behavior has test coverage: backend logic goes in `backend/tests/`,
   frontend components go in `frontend/**/*.test.tsx`.
3. The demo flow still works end to end: catalog → policy check →
   negotiation → payment → audit trail. There's no automated E2E check for
   this yet (planned — see the Phase 7 roadmap for Playwright), so this is
   a manual check for now: start both servers, run a session from the UI,
   and confirm the audit trail streams events for each stage.

## Commit style

Plain, descriptive commit messages in the imperative mood ("Add retry logic
to checkout", not "Added" or "Adds"). No enforced format beyond that.
