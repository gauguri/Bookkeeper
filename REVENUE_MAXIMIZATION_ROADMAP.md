# Revenue Maximization Roadmap

## Goal

Build a revenue operating system on top of the current ERP foundation so Bookkeeper can:

- win more deals
- close deals faster
- raise average selling price without margin erosion
- increase customer retention and reorder velocity
- give leadership a reliable revenue forecast

This roadmap is intentionally revenue-first. Accounts payable and deeper expense controls still matter, but the next strategic investment should be commercial execution, customer intelligence, and revenue quality.

## Current Foundation In The Codebase

The codebase already contains meaningful revenue building blocks:

- Sales command center with accounts, opportunities, quotes, and orders
- Quote evaluation and approval logic
- Revenue control tower reporting
- Customer 360 page with KPIs, aging, revenue trend, activity, and top items
- Customer, invoice, payment, and item workflows
- Analytics and dashboard primitives
- Role and module access control

Relevant files:

- `web/src/pages/sales-command-center/SalesCommandCenterPage.tsx`
- `web/src/pages/CustomerProfilePage.tsx`
- `server/app/sales_management/service.py`
- `server/app/sales_management/deal_desk.py`
- `server/app/routers/sales_management.py`
- `server/app/tests/test_revenue_control_tower.py`

## Product Thesis

Revenue Maximization in this ERP should not be a dashboard-only module. It should be an execution layer that sits inside the daily workflow of:

- accounts
- opportunities
- quotes
- orders
- customer follow-up
- renewals and reorders

The system should recommend actions, detect leakage, and enforce commercial discipline at the moment a user is working a deal.

## Priority Order

1. Sales execution and follow-up
2. Customer intelligence
3. Pipeline acceleration and forecast quality
4. Pricing and margin optimization
5. Growth loops for retention, reorder, and expansion
6. AI-guided commercial operating system

## Phase 1: Sales Execution System

### Objective

Prevent leads, opportunities, quotes, and follow-ups from going dark.

### Features

- Activity/task model with due dates, owners, status, priority, and outcome
- Follow-up cadence engine for opportunities and quotes
- Next-best-action recommendations on account, opportunity, and quote pages
- Stalled-deal detection by stage age and inactivity age
- Manager workbench for rep follow-up compliance
- Quote follow-up queue with reminders after send, view, and no-response windows
- Inbox-style "Needs action today" view inside sales command center

### Key User Outcomes

- fewer lost opportunities due to missed follow-up
- faster quote-to-order conversion
- better rep discipline and manager visibility

### Dependencies

- extend `SalesActivity` into a true task/follow-up model
- add ownership and due-date filtering endpoints
- add summary APIs for overdue work and stalled deals

## Phase 2: Customer Intelligence

### Objective

Turn customer data into actionable selling context.

### Features

- customer health score
- reorder likelihood score
- churn risk score
- payment risk and credit behavior trend
- product affinity and cross-sell recommendations
- customer profitability view by revenue, gross margin, payment speed, and service burden
- account timeline that merges sales, invoices, payments, support-style notes, and fulfillment events

### Key User Outcomes

- reps know who to call first
- managers can separate growth accounts from risky accounts
- account plans become evidence-based instead of anecdotal

### Dependencies

- enrich customer analytics APIs
- unify activity/event history across modules
- add derived scoring jobs or service functions

## Phase 3: Pipeline Acceleration And Forecast Quality

### Objective

Make pipeline trustworthy and operationally useful.

### Features

- stage aging dashboard
- forecast categories: commit, best case, pipeline, upside
- opportunity confidence score
- rep forecast rollup and manager override workflow
- conversion leakage analysis by stage, source, rep, segment, and product mix
- lost-deal reason capture and analytics
- close-date slippage detection

### Key User Outcomes

- stronger weekly forecast calls
- better visibility into where deals die
- fewer end-of-quarter surprises

### Dependencies

- stage timestamp history
- close-date history
- structured loss reasons
- owner and team rollups

## Phase 4: Pricing And Margin Optimization

### Objective

Raise realized revenue while protecting margin.

### Features

- recommended sell price bands by item, customer tier, and historical win behavior
- quote guardrails for discount, floor price, and target margin
- approval routing by margin risk, discount severity, or exception type
- realized price waterfall
- margin leakage alerts after order or invoice creation
- customer-specific pricebook and contract pricing support
- quote win/loss analysis against price position

### Key User Outcomes

- higher average selling price
- less uncontrolled discounting
- higher gross margin quality

### Dependencies

- stronger quote metadata and pricing context
- historical price/win outcome dataset
- approval and exception framework

## Phase 5: Retention, Reorder, And Expansion

### Objective

Increase lifetime value from the installed customer base.

### Features

- reorder reminders based on buying cadence
- renewal and repeat-order queue
- dormant account reactivation list
- whitespace analysis by customer vs peer segment
- expansion play recommendations
- top customer concentration risk view

### Key User Outcomes

- more repeat revenue
- fewer dormant customers
- stronger account expansion motion

### Dependencies

- customer purchase cadence model
- segmentation engine
- repeat-order opportunity generation

## Phase 6: AI Commercial Copilot

### Objective

Move from descriptive insight to prescriptive action.

### Features

- AI-generated account brief before outreach
- suggested next email/call objective
- meeting prep and objection handling guidance
- draft quote notes and negotiation guidance
- anomaly detection for deal risk and margin erosion
- "who should I call today?" prioritized queue

### Guardrails

- recommendations must cite supporting ERP data
- actions should be explainable
- no autonomous customer communication without human approval

## First Build Slice

The best first implementation slice is:

### Sales Follow-Up Workbench

This should be the first feature shipped because it creates immediate revenue execution value and fits the current architecture.

### Scope

- add task/follow-up records linked to account, opportunity, quote, and order
- support statuses: `OPEN`, `DONE`, `SNOOZED`, `CANCELLED`
- support due date, owner, priority, and note
- create APIs for:
  - list my open follow-ups
  - create follow-up
  - update follow-up
  - mark complete
  - list stalled opportunities and stale quotes
- add a new panel to the sales command center:
  - due today
  - overdue
  - stale opportunities
  - quotes awaiting follow-up
- add lightweight create-follow-up actions on account, opportunity, and quote pages

### Why This First

- directly improves sales execution
- leverages existing sales entities and activity patterns
- creates the event stream needed for later customer intelligence and AI guidance
- avoids waiting on larger data platform work

## Suggested Delivery Sequence

### Sprint 1

- define follow-up data model
- add backend CRUD and summary APIs
- add command center "My Follow-Ups" and "Needs Attention" panels

### Sprint 2

- add stalled opportunity and stale quote detection
- add follow-up creation from account, opportunity, and quote pages
- add rep and manager filtering

### Sprint 3

- add customer health and reorder-likelihood v1
- add account prioritization view

### Sprint 4

- add forecast confidence and stage aging
- add quote follow-up automation rules

## Success Metrics

Track these metrics from the start:

- quote-to-order conversion rate
- average days from quote to order
- percent of opportunities with next scheduled action
- percent of overdue follow-ups
- stale opportunity count
- win rate by rep
- average discount rate
- average gross margin percent
- repeat-order rate

## Non-Goals For This Track

These are important, but not first in the revenue-first sequence:

- full AP workflow buildout
- advanced banking reconciliation enhancements
- deep close-management expansion
- full multi-entity and intercompany design

Those should continue, but should not block the commercial operating layer.

## Recommended Immediate Next Build

Implement the Sales Follow-Up Workbench first, then Customer Intelligence v1.

That gives Bookkeeper a practical revenue engine instead of just a finance system with sales screens.
