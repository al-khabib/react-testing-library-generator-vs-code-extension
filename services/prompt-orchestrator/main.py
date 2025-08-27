from datetime import datetime
from utils import ServiceClient, setup_logging
from schemas import (
    GenerateRequest, GenerateResponse, EnhancedGenerateRequest,
    HealthResponse, AnalysisRequest
)
from fastapi import FastAPI, HTTPException
import os
import sys
from contextlib import asynccontextmanager

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))


setup_logging("prompt-orchestrator")

SYNTHESIZER_URL = os.getenv("SYNTHESIZER_URL", "http://localhost:8002")
ANALYSIS_URL = os.getenv("ANALYSIS_URL", "http://localhost:8004")

synthesizer_client = None
analysis_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global synthesizer_client, analysis_client
    synthesizer_client = ServiceClient(SYNTHESIZER_URL, "synthesizer")
    analysis_client = ServiceClient(ANALYSIS_URL, "analyzer")

    print(f"🎯 Prompt Orchestrator started")
    print(f"   - Synthesizer: {SYNTHESIZER_URL}")
    print(f"   - Analysis: {ANALYSIS_URL}")

    yield

    await synthesizer_client.close()
    await analysis_client.close()

app = FastAPI(
    title="Prompt Orchestrator",
    description="Orchestrates test generation by coordinating analysis and synthesis",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/healthz", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        service="prompt-orchestrator",
        timestamp=datetime.now()
    )


@app.post("/orchestrate/generate")
async def orchestrate_generate(request: GenerateRequest):
    """Orchestrate test generation with analysis and synthesis"""

    try:
        print(
            f"🔄 Orchestrating generation for: {os.path.basename(request.componentPath)}")

        # Step 1: Analyze component
        print("   📊 Getting code analysis...")
        analysis_result = await analysis_client.post("/analyze", {
            "componentPath": request.componentPath,
            "componentSource": request.componentSource
        })

        # Step 2: Create enhanced request
        enhanced_request = EnhancedGenerateRequest(
            componentPath=request.componentPath,
            componentSource=request.componentSource,
            goals=request.goals,
            context=analysis_result["context"],
            ast_summary=analysis_result["ast_summary"]
        )

        print("   🧠 Generating tests with LLM...")

        # Step 3: Generate tests
        synthesis_result = await synthesizer_client.post(
            "/synthesize",
            enhanced_request.dict()
        )

        print(
            f"   ✅ Generated {len(synthesis_result.get('tests', []))} test(s)")

        return synthesis_result

    except Exception as e:
        print(f"   ❌ Orchestration failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Orchestration failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
