# Bookkeeper MVP

A monorepo MVP for a QuickBooks-style bookkeeping system focused on correct double-entry accounting and auditability.

## Stack
- **Backend:** FastAPI + SQLAlchemy + Alembic
- **DB:** Postgres
- **Frontend:** React + Vite + Tailwind
- **Queue:** Placeholder for RQ/Celery (Phase 2)

## Getting Started (Local)

### Prerequisites
- Docker + Docker Compose

### Run
```bash
docker compose up --build
```

### Migrate
In a separate terminal:
```bash
docker compose exec server alembic upgrade head
```

### First-run bootstrap
After migrations, open the web app and complete `/setup` to create the first admin account.
The setup wizard appears only when there are zero users.

Optional seed data (chart of accounts + demo records):
```bash
docker compose exec server python -m app.seed
```

### URLs
- API: http://localhost:8000
- Web: http://localhost:5173

### Sample credentials
Use the admin credentials you create in the setup wizard.

For local recovery, you can reset/create `admin@bookkeeper.local` when explicitly enabled:
```bash
ALLOW_DEV_RESET=true ENV=development curl -X POST http://localhost:8000/api/auth/dev/reset-admin
```
Custom password:
```bash
ALLOW_DEV_RESET=true ENV=development curl -X POST http://localhost:8000/api/auth/dev/reset-admin \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-new-password123!"}'
```

## QuickBooks Import (MVP)
- **QuickBooks Online (QBO):** OAuth + API import planned (Phase 2).
- **QuickBooks Desktop:** CSV upload supported via mapping stubs.

Sample CSVs:
- `server/sample_data/qbd_chart_of_accounts.csv`
- `server/sample_data/qbd_customers.csv`
- `server/sample_data/qbd_transactions.csv`

## Accounting Rules (MVP)
- Every posted transaction is a journal entry with balanced debits/credits.
- Posted journal lines are immutable; edits are handled via reversals.

## Phase 2 Roadmap
- Full auth flow (JWT + refresh tokens) and RBAC enforcement
- Transaction APIs (invoices, bills, payments) with JE posting
- Reports: P&L, Balance Sheet, Cash Flow, AR/AP aging
- QBO OAuth + API import and background jobs
- Full import wizard and reconciliation views
- Attachments + storage abstraction (S3)
- Comprehensive audit log UI

## Testing
```bash
cd server
pytest
```

## Sales Management Module (MVP+ skeleton)
- **Primary UI route:** `/sales/management`
- **Legacy sales requests remain active:** `/sales-requests`
- **Core backend endpoints:**
  - `GET/POST /api/sales/accounts`
  - `POST /api/sales/contacts`
  - `GET/POST /api/sales/opportunities`
  - `GET/POST /api/sales/quotes`
  - `POST /api/sales/quotes/{quote_id}/convert-to-order`
  - `GET/POST /api/sales/orders`
  - `POST /api/sales/orders/{order_id}/status`
  - `GET/POST /api/sales/activities`
  - `GET /api/sales/pricebooks`
  - `GET /api/sales/reports/summary`
  - `POST /api/sales/sales-requests/{sales_request_id}/convert-to-opportunity`

The command center includes KPI cards, stage summary, quick actions, URL-driven list views (search/saved view/sort/pagination/density/column toggle), and placeholders for activities/reports expansion.
