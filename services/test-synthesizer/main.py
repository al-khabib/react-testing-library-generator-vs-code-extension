from datetime import datetime
from utils import ServiceClient, setup_logging
from schemas import EnhancedGenerateRequest, GenerateResponse, TestFile, HealthResponse
from fastapi import FastAPI, HTTPException
import os
import sys
import json
from contextual import asynccontextmanager

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))


setup_logging("test-synthesizer")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-coder-v2")

ollama_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ollama_client
    ollama_client = ServiceClient(OLLAMA_URL, "ollama")

    print(f"🧠 Test Synthesizer started")
    print(f"   - Ollama: {OLLAMA_URL}")
    print(f"   - Model: {MODEL_NAME}")

    # Test Ollama connection
    try:
        await test_ollama_connection()
        print("   ✅ Ollama connection successful")
    except Exception as e:
        print(f"   ⚠️  Ollama connection failed: {e}")

    yield

    await ollama_client.close()

app = FastAPI(
    title="Test Synthesizer",
    description="Generates RTL tests using LLM",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/healthz", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        service="test-synthesizer",
        timestamp=datetime.now()
    )


@app.post("/synthesize")
async def synthesize_tests(request: EnhancedGenerateRequest):
    """Generate RTL tests using LLM"""

    component_name = request.ast_summary.component_name or "Component"
    print(f"🧠 Synthesizing tests for: {component_name}")

    try:
        # Build prompt
        prompt = build_prompt(request)

        # Call Ollama
        print("   🔄 Calling LLM...")
        response = await call_ollama(prompt)

        # Parse response
        tests = parse_llm_response(response, component_name)

        result = GenerateResponse(
            tests=tests,
            metadata={
                "model": MODEL_NAME,
                "component_name": component_name,
                "hooks_count": len(request.ast_summary.hooks_used),
                "events_count": len(request.ast_summary.event_handlers)
            }
        )

        print(f"   ✅ Generated {len(tests)} test file(s)")
        return result.dict()

    except Exception as e:
        print(f"   ❌ Synthesis failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"LLM synthesis failed: {str(e)}")


async def test_ollama_connection():
    """Test connection to Ollama"""
    await ollama_client.post("/api/generate", {
        "model": MODEL_NAME,
        "prompt": "test",
        "stream": False,
        "options": {"num_predict": 1}
    })


async def call_ollama(prompt: str) -> str:
    """Call Ollama API"""

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 1000,
            "stop": ["```
        }
    }

    result = await ollama_client.post("/api/generate", payload)
    return result.get("response", "")

def build_prompt(request: EnhancedGenerateRequest) -> str:
    """Build structured prompt for LLM"""

    component_name = request.ast_summary.component_name or "Component"
    coverage = request.goals.coverage

    # Context information
    context_info = []
    if request.ast_summary.hooks_used:
        context_info.append(
            f"Uses hooks: {', '.join(request.ast_summary.hooks_used)}")
    if request.ast_summary.event_handlers:
        context_info.append(
            f"Has event handlers: {', '.join(request.ast_summary.event_handlers)}")
    if request.ast_summary.jsx_elements:
        context_info.append(
            f"Contains elements: {', '.join(request.ast_summary.jsx_elements[:5])}")

    context_str = ". ".join(context_info) if context_info else "Simple component"

    prompt = f"""You are a senior React Testing Library engineer. Generate Jest + RTL tests for this React component.

COMPONENT ANALYSIS:
- Name: {component_name}
- Context: {context_str}
- Coverage Level: {coverage}

COMPONENT CODE:
```tsx
{request.componentSource}
REQUIREMENTS:

Use @testing-library/react and @testing-library/user-event

Focus on user behavior, not implementation details

Use accessible queries (getByRole, getByLabelText) when possible

Test user interactions if event handlers present

Test hooks behavior if hooks are used

Coverage level "{coverage}" means:

smoke: Basic rendering test

interactions: User interactions and state changes

comprehensive: Edge cases, error states, accessibility

OUTPUT FORMAT:
Return ONLY valid JSON in this exact format:
{{
"tests": [
{{
"filename": "{component_name}.test.tsx",
"code": "// Complete test file code here"
}}
]
}}

Generate the test code now:"""

    return prompt
def parse_llm_response(response: str, component_name: str) -> list[TestFile]:
"""Parse LLM response and extract test files"""
