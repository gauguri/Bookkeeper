from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    ar,
    auth,
    backlog,
    chart_of_accounts,
    control,
    dashboard,
    health,
    inventory,
    journal_entries,
    purchase_orders,
    sales,
    sales_requests,
    suppliers,
)

app = FastAPI(title="Bedrock API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ar.router)
app.include_router(auth.router)
app.include_router(backlog.router)
app.include_router(sales.router)
app.include_router(dashboard.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)
app.include_router(sales_requests.router)
app.include_router(purchase_orders.router)
app.include_router(chart_of_accounts.router)
app.include_router(journal_entries.router)
app.include_router(control.router)


@app.get("/")
def root():
    return {"status": "ok"}
