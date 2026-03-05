# Journal Batch Posting Architecture

## Overview
The accounting subsystem now posts through a centralized `JournalPostingEngine` (`app/accounting/gl_engine.py`).
All domain events are converted into balanced journal batches before persisting GL entries.

## Core guarantees
- **Double-entry required**: each batch is validated with `total_debits == total_credits`.
- **Transactional posting**: posting runs inside a DB transaction (`begin_nested`).
- **Idempotency**: `(event_type, event_id)` unique key on `journal_batches`.
- **Guardrails**: posting rejects asset over-credit patterns (e.g., AR/Cash below threshold).

## Storage
- `journal_batches`: event-level posting envelope.
- `journal_batch_lines`: debit/credit lines per batch.
- `gl_entries`: reporting-ready line mirror used by analytics/reporting.

## Posting templates
Implemented event templates:
- `INVOICE_POSTED` → Dr AR / Cr Revenue (+ optional COGS/inventory)
- `SHIPMENT_POSTED` → Dr AR or Dr Unearned / Cr Revenue; Dr COGS / Cr Inventory
- `PAYMENT_POSTED` → Dr Cash / Cr AR
- `CASH_SALE` → Dr Cash / Cr Revenue
- `PREPAYMENT_RECEIVED` → Dr Cash / Cr Unearned Revenue
- `SHIPMENT_FOR_PREPAID_ORDER` → Dr Unearned Revenue / Cr Revenue; Dr COGS / Cr Inventory
- `CREDIT_MEMO` → Dr Revenue / Cr AR
- `WRITE_OFF` → Dr Bad Debt Expense / Cr AR

## Statement reconciliation
Reporting (`app/analytics/kpis.py`) calculates:
- Income Statement net income from GL revenue/expense account movements.
- Balance Sheet equity as retained earnings + current period net income.
- Validation warning logged when:
  `totalAssets != totalLiabilities + totalEquity`.

## Diagnostics
`run_gl_diagnostics()` reports:
- negative asset balances
- unbalanced journal batches
- payments lacking AR credit effect
- invoices lacking GL postings

This tool is read-only and does not mutate historical postings.
