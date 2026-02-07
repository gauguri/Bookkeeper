from fastapi import FastAPI

from .routers import health

app = FastAPI(title="Bookkeeper API")

app.include_router(health.router)


@app.get("/")
def root():
    return {"status": "ok"}
