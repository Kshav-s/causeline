# CauseLine — ABT CPD Complaint Analytics & Prediction Platform

Full-stack complaint platform. **Anyone can raise a complaint without an account**: attach photos, get a reference number and a private access key, and see the real AI analysis. Quality staff investigate, verify and analyse behind a protected staff area (`/staff`, not linked from the public site). Every value on screen is labelled as **recorded fact**, **rule-based calculation**, **model prediction**, **similarity evidence**, **historical model output**, **human verified** or **insufficient data**.

> **All supplied data is synthetic** (`SYNTHETIC_ABT_CPD`). Nothing in the demo describes real ABT CPD performance.

| Layer | Stack | Location |
|---|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind 4, TanStack Query, Recharts, React Hook Form + Zod, Radix | `frontend/` |
| Backend | FastAPI, Pydantic 2, SQLAlchemy 2, pandas, scikit-learn 1.9.1, sentence-transformers | `backend/` |
| Database | SQLite (default) - PostgreSQL/Supabase via `DATABASE_URL` | `backend/data/` |
| Models | Supplied packages, referenced in place + one verified reproduction | `AI_COMPLAINT_INTELLIGENCE/`, `ml_predictive_analytics (1)/`, `ml_project/reproduced/` |

## Quick start (Windows, PowerShell or Git Bash)

```bash
# 1. Backend
cd backend
py -3.14 -m venv .venv                       # Python 3.12+; verified on 3.14.7
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env                         # set JWT_SECRET
cd ..
backend/.venv/Scripts/python -I scripts/reproduce_root_cause_model.py   # once: rebuild + verify the root-cause model
backend/.venv/Scripts/python backend/scripts/seed.py --admin-email you@company.com --with-analyst
#   -> prints generated passwords once (or set ADMIN_PASSWORD / ANALYST_PASSWORD beforehand)
cd backend && .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                                  # http://localhost:5173  (proxies /api to :8000)
```

API docs (development only): http://127.0.0.1:8000/api/docs

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q              # 62 tests: ML parity, engines, API, public flow, images, privacy, uploads
cd frontend && npm test                                      # 9 component tests
cd frontend && npx tsc -b && npm run build                   # type-check + production build
# with both servers running:
CL_EMAIL=<staff email> CL_PASSWORD=... npx playwright test   # E2E: public complaint + photos -> AI -> register, privacy, staff view (desktop + mobile)
CL_BASE=http://localhost:5173 CL_EMAIL=... CL_PASSWORD=... node e2e/screenshots.mjs <outDir>   # full-page screenshots, overflow + console checks
```

## Documentation
`docs/` — PROJECT_OVERVIEW, ARCHITECTURE, ML_MODEL_AUDIT, DATA_INVENTORY, DATA_DICTIONARY, DATA_QUALITY_REPORT, DATA_READINESS_REPORT, DATABASE_SCHEMA, API_DOCUMENTATION, TESTING_REPORT, DEPLOYMENT_GUIDE, KNOWN_LIMITATIONS, DESIGN_SYSTEM.

## User journeys
| Who | Where | Account? |
|---|---|---|
| Visitor | `/` → **Raise a Complaint** (`/raise`) → result page `/complaint/<ID>` (reference + private key, AI analysis, photos) | No |
| Visitor | `/track` (reference + key), `/register` (anonymised list) | No |
| Quality staff | `/staff` → `/app` (dashboard, complaints, investigation notes, CAPA, root cause, analytics, reports, data upload, admin) | Yes - staff accounts only, created by an administrator |

There is no sign-up. Demo booking was removed from the product (the old `demo_bookings` table and its records are kept untouched).
