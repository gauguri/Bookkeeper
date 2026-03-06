import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderToString } from "react-dom/server";

import BacklogPage from "./BacklogPage";

vi.mock("../hooks/useAnalytics", () => ({
  useOperationalBacklog: vi.fn(),
}));

const { useOperationalBacklog } = await import("../hooks/useAnalytics");

describe("BacklogPage", () => {
  it("renders empty state safely", () => {
    vi.mocked(useOperationalBacklog).mockReturnValue({
      data: {
        range: "YTD",
        filters: {},
        kpis: { total_backlog_value: 0, open_sales_requests: 0, open_invoices: 0, open_lines: 0 },
        item_shortages: [],
        customer_backlog: [],
        debug: { computed_at: new Date().toISOString(), source_counts: {} },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as never);

    const html = renderToString(
      <MemoryRouter>
        <BacklogPage />
      </MemoryRouter>
    );

    expect(html).toContain("Operational Backlog");
    expect(html).toContain("No open demand found");
  });

  it("renders both tables with data", () => {
    vi.mocked(useOperationalBacklog).mockReturnValue({
      data: {
        range: "YTD",
        filters: {},
        kpis: { total_backlog_value: 2500, open_sales_requests: 2, open_invoices: 1, open_lines: 3 },
        item_shortages: [
          {
            item_id: 1,
            sku: "W-1",
            name: "Widget",
            on_hand: 4,
            reserved: 2,
            available: 2,
            backlog_qty: 5,
            shortage_qty: 3,
            next_inbound_eta: null,
          },
        ],
        customer_backlog: [
          {
            customer_id: 9,
            customer_name: "Acme",
            backlog_value: 2500,
            oldest_request_age_days: 18,
            status_mix: { open: 2, partial: 1, backordered: 1 },
            risk_flag: "yellow",
            risk_reasons: ["aged_requests"],
          },
        ],
        debug: { computed_at: new Date().toISOString(), source_counts: {} },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as never);

    const html = renderToString(
      <MemoryRouter>
        <BacklogPage />
      </MemoryRouter>
    );

    expect(html).toContain("Item shortages");
    expect(html).toContain("Customer backlog");
    expect(html).toContain("Widget");
    expect(html).toContain("Acme");
  });
});
