from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import dashboard, health, sales, suppliers

app = FastAPI(title="Bookkeeper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sales.router)
app.include_router(dashboard.router)
app.include_router(suppliers.router)


@app.get("/")
def root():
    return {"status": "ok"}
