# Agent Commerce Adapter

A demo of an AI buyer agent shopping a merchant's product catalog,
negotiating price with a merchant agent, and completing a real
(Razorpay test-mode) payment — with every decision, guardrail check, and
negotiation turn streamed live to an audit trail.

See [docs/architecture.md](docs/architecture.md) for a full system diagram
and request-flow walkthrough, and [CONTRIBUTING.md](CONTRIBUTING.md) for
local setup, tests, and lint.

## Stack

- **Backend** — FastAPI (Python 3.13), Groq for agent reasoning, Razorpay
  for payments, structured logging via `structlog`.
- **Frontend** — Next.js (React 19, TypeScript, Tailwind CSS).

## Quick start

```bash
# Backend
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # fill in GROQ_API_KEY, RAZORPAY_KEY_ID/SECRET
venv/bin/uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000.

## Core flow

Catalog upload/translation → policy guard check → buyer/merchant
negotiation → Razorpay checkout → audit trail. The audit trail panel in the
UI streams every step of this live via Server-Sent Events.
