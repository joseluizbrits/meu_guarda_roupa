from fastapi import FastAPI

from app.api.v1 import router as api_v1_router

app = FastAPI(title="Meu Guarda-roupa API")

app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
