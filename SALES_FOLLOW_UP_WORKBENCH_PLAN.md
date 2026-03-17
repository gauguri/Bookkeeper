# Sales Follow-Up Workbench Plan

## Objective

Ship the first execution layer of the Revenue Maximization roadmap by turning sales follow-ups into a first-class workflow inside Bookkeeper.

## Why This First

- fits the current sales architecture
- creates immediate revenue execution value
- produces the event and task data needed for later customer intelligence and AI guidance
- can be delivered incrementally without blocking on AP, close, or data-platform work

## Current Extension Point

Use `sales_activities` as the foundation rather than introducing a second overlapping task system.

Current model support already includes:

- `entity_type`
- `entity_id`
- `type`
- `subject`
- `body`
- `due_date`
- `completed_at`
- `created_by`

This makes `SalesActivity` the right place to evolve into a follow-up workbench.

## Implementation Phases

### Phase 1: Backend Follow-Up Foundation

Add the minimum fields and APIs needed to manage follow-up work.

#### Data Model Changes

- `status` with values such as `OPEN`, `DONE`, `SNOOZED`, `CANCELLED`
- `priority` with values such as `LOW`, `MEDIUM`, `HIGH`
- `owner_user_id`
- `activity_kind` or a stronger convention around `type` so follow-ups can be distinguished from system timeline events

#### API Changes

- create follow-up
- list follow-ups by owner/status/entity
- complete follow-up
- update due date, subject, notes, priority, owner, status
- summary endpoint for:
  - due today
  - overdue
  - open follow-ups
  - stale opportunities
  - stale quotes

#### Service Changes

- helper to determine whether an activity is actionable
- helper to compute stale opportunity and quote thresholds
- helper to create system-generated follow-up recommendations

### Phase 2: Sales Command Center Workbench

- My Follow-Ups widget
- Needs Attention widget
- stale opportunities list
- stale quotes list
- filters for owner, status, priority, due-window

### Phase 3: Inline Workflow Actions

- add "Create follow-up" to account detail
- add "Create follow-up" to opportunity detail
- add "Create follow-up" to quote detail
- add "Mark done" for existing follow-ups

### Phase 4: Smart Detection

- create stale opportunity signals from stage age and inactivity age
- create stale quote signals from quote age, approval status, and no follow-up activity
- create rule-driven reminders after quote creation and approval

## First Engineering Slice

The first slice to implement now is:

1. extend `SalesActivity` for follow-up ownership, priority, and status
2. add follow-up CRUD/list APIs
3. add summary API for open, due today, overdue, stale opportunities, and stale quotes
4. add backend tests

This gives the frontend a stable contract and avoids redesigning the model twice.

## Proposed API Surface

### Endpoints

- `GET /api/sales/follow-ups`
- `POST /api/sales/follow-ups`
- `PATCH /api/sales/follow-ups/{activity_id}`
- `POST /api/sales/follow-ups/{activity_id}/complete`
- `GET /api/sales/reports/follow-up-summary`

### Filters

- `owner_user_id`
- `status`
- `entity_type`
- `entity_id`
- `include_overdue`
- `include_completed`

## Stale Detection Rules v1

### Opportunity

Flag as stale when:

- stage is not closed
- no activity in 7 or more days
- or expected close date has slipped into the past

### Quote

Flag as stale when:

- status is not won/closed
- not converted to order
- no follow-up in 3 or more days after creation or approval

These thresholds should be constants for now and moved to settings later.

## Testing Plan

- create follow-up
- list only actionable follow-ups
- complete follow-up
- filter by owner and status
- due-today and overdue summary counts
- stale opportunity detection
- stale quote detection

## Definition Of Done

- follow-up records can be created, assigned, updated, and completed
- summary endpoint returns stable queue data
- tests cover key workflow behavior
- no regression in existing sales activity timeline endpoints
