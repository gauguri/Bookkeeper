## Summary
Adds 4 new gauge metrics to the Operator Dashboard for running the business at a glance:

- **DSO (Days Sales Outstanding)** — avg days to collect payment from customers (lower is better, 0-120 day scale)
- **Order Fulfillment Rate** — % of sales requests that reached invoiced/shipped/closed YTD (higher is better)
- **A/R Collection Rate** — payments collected vs revenue invoiced YTD (higher is better)
- **Inventory Turnover** — COGS / avg inventory value YTD (higher is better, 0-12x scale)

Each gauge uses the existing `Gauge` SVG component with custom color zones and health labels. The dashboard grid is expanded from 2-column to 3-column layout to accommodate all 6 gauges.

### Backend
- `server/app/dashboard/service.py` — 4 new metric computations added to `get_owner_cockpit_metrics()`
- `server/app/dashboard/schemas.py` — 4 new optional fields on `OwnerCockpitResponse`

### Frontend
- 4 new gauge components: `DsoGauge`, `FulfillmentRateGauge`, `CollectionRateGauge`, `InventoryTurnoverGauge`
- `SalesLanding.tsx` updated with imports, types, and 3x2 gauge grid

## Test plan
- [ ] Open the Operator Dashboard — verify all 6 gauges render in a 3-column grid
- [ ] Verify each gauge shows correct zone label and color based on value
- [ ] Verify API response includes `dso_days`, `fulfillment_rate_pct`, `collection_rate_pct`, `inventory_turnover`
- [ ] Verify loading skeleton shows 6 placeholders while data loads

🤖 Generated with [Claude Code](https://claude.com/claude-code)
