
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
import httpx
import asyncio
import json

app = FastAPI()

OLLAMA_API_URL = "http://localhost:11434/api/generate"

BASE_PROMPT = """
    You are a code generator for Jest and React Testing Library.
    You must generate a TypeScript test file for the provided React component.
    STRICT RULES:
    - Output ONLY the valid TypeScript RTL+Jest code as it would appear in a .test.tsx file.
    - NO markdown code fences.
    - NO < think > tags, explanations, steps, context, or any non-code lines.
    - NO bullet points, headers, or summary.
    - Do not include anything except the code lines to be saved to the test file.
    - Begin with the first import statement and end at the last closing bracket.
    If you output anything else, it will cause the file to fail to compile.

    BAD output example(do NOT do):
    <think >
    We will...
    - Import modules
    - Write a test

    GOOD output example(DO this):


    describe('MyComponent', ()= > {
        it('renders', ()=> {
        render(< MyComponent / >);
            expect(screen.getByText('Hello')).toBeInTheDocument();
        });
    });

    Now, generate the test file for this component:
    <-- REACT COMPONENT CODE HERE - ->

"""


def clean_chunk_text(text):
    # Remove code fences, <think> blocks, plans, or other unwanted lines
    for fence in ['```tsx', '```', '```typescript', '```js', '```javascript']:
        if text.strip().startswith(fence):
            text = text.replace(fence, '', 1)
            text = text.replace('<think>', '').replace('</think>', '')
            return text


@app.post('/generate_test')
async def generate_test(request: Request):
    body = await request.json()
    component_code = body['component_code']
    prompt = BASE_PROMPT + "\n\n" + component_code

    payload = {
        "model": body.get('model', "deepseek-coder-v2"),
        "prompt": prompt,
        "stream": True
    }

    async def stream_llm():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream('POST', OLLAMA_API_URL, json=payload) as r:
                async for chunk in r.aiter_text():
                    for line in chunk.splitlines():
                        if not line.strip():
                            continue
                        try:
                            # Ollama streams lines of JSON
                            parsed = json.loads(line)
                            if 'response' in parsed:
                                text = clean_chunk_text(parsed['response'])
                                if text.strip():
                                    yield text
                        except Exception:
                            continue

    return StreamingResponse(stream_llm(), media_type="text/plain")
