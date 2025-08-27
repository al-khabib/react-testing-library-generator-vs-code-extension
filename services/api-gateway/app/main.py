from fastapi import FastAPI
from .schemas import GenerateRequest, GenerateResponse, ValidateRequest, ValidateResponse
from .services import generate_tests, validate_source

app = FastAPI(title="TestGen Gateway", version="0.1.0")


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/v1/tests/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    result = await generate_tests(req.componentPath, req.componentSource, req.goals.coverage)
    return result


@app.post("/v1/tests/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    result = await validate_source(req.filePath, req.source)
    return result
