from fastapi import FastAPI

app = FastAPI(title="Meu Guarda-roupa API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
