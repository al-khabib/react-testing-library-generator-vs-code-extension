from datetime import datetime
from utils import ServiceClient, setup_logging, get_request_id
from schemas import (
    GenerateRequest, GenerateResponse, ValidateRequest, ValidateResponse,
    HealthResponse, ServiceError
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
from contextlib import asynccontextmanager

# Add shared to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))


# Setup logging
setup_logging("api-gateway")

# Service URLs
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:8001")
VALIDATOR_URL = os.getenv("VALIDATOR_URL", "http://localhost:8003")
DATA_COLLECTOR_URL = os.getenv("DATA_COLLECTOR_URL", "http://localhost:8006")

# Global clients
orchestrator_client = None
validator_client = None
collector_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global orchestrator_client, validator_client, collector_client
    orchestrator_client = ServiceClient(ORCHESTRATOR_URL, "orchestrator")
    validator_client = ServiceClient(VALIDATOR_URL, "validator")
    collector_client = ServiceClient(DATA_COLLECTOR_URL, "collector")

    print(f"🚀 API Gateway started")
    print(f"   - Orchestrator: {ORCHESTRATOR_URL}")
    print(f"   - Validator: {VALIDATOR_URL}")
    print(f"   - Collector: {DATA_COLLECTOR_URL}")

    yield

    # Shutdown
    await orchestrator_client.close()
    await validator_client.close()
    await collector_client.close()

app = FastAPI(
    title="RTL TestGen API Gateway",
    description="Central API gateway for React Testing Library test generation",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = get_request_id()
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/healthz", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        service="api-gateway",
        timestamp=datetime.now()
    )


@app.get("/healthz/full")
async def health_full():
    """Check health of all downstream services"""
    services = {
        "orchestrator": orchestrator_client,
        "validator": validator_client,
        "collector": collector_client
    }

    health_status = {"api-gateway": "ok"}

    for service_name, client in services.items():
        try:
            await client.get("/healthz")
            health_status[service_name] = "ok"
        except Exception as e:
            health_status[service_name] = f"error: {str(e)}"

    overall_status = "ok" if all(
        status == "ok" for status in health_status.values()) else "degraded"

    return {
        "status": overall_status,
        "services": health_status,
        "timestamp": datetime.now()
    }


@app.post("/v1/tests/generate", response_model=GenerateResponse)
async def generate_tests(request: GenerateRequest):
    """Generate RTL tests for a React component"""
    request_id = get_request_id()

    try:
        # Send to orchestrator
        result = await orchestrator_client.post(
            "/orchestrate/generate",
            request.dict()
        )

        # Collect data for training (async, don't wait)
        try:
            await collector_client.post("/collect/generation", {
                "request_id": request_id,
                "request": request.dict(),
                "response": result,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            print(f"Warning: Failed to collect training data: {e}")

        return GenerateResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Generation failed: {str(e)}")


@app.post("/v1/tests/validate", response_model=ValidateResponse)
async def validate_tests(request: ValidateRequest):
    """Validate and fix RTL test selectors"""
    try:
        result = await validator_client.post("/validate", request.dict())
        return ValidateResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Validation failed: {str(e)}")


@app.post("/v1/feedback/quality")
async def submit_quality_feedback(feedback: dict):
    """Submit quality feedback for generated tests"""
    try:
        result = await collector_client.post("/collect/feedback", feedback)
        return {"status": "collected", "feedback_id": result.get("id")}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to collect feedback: {str(e)}")


@app.get("/v1/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        stats = await collector_client.get("/stats/dashboard")
        return stats
    except Exception as e:
        return {
            "testsGeneratedToday": 0,
            "coverageImprovement": 0,
            "timeSavedHours": 0,
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
