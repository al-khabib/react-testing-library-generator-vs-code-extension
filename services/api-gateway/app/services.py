import json
from .llm_client import chat

SYSTEM_PROMPT = (
    "You are a senior React Testing Library engineer. "
    "Generate Jest + RTL tests focusing on user-observable behavior, accessible queries, and userEvent. "
    "Output strictly JSON: {\"tests\":[{\"filename\":\"<name>\",\"code\":\"<contents>\"}]} with valid escaped newlines."
)


def build_messages(component_path: str, src: str, coverage: str):
    user = f"""Component Path: {component_path}
Coverage: {coverage}

Source:
Constraints:
- Use @testing-library/react and @testing-library/user-event.
- Prefer getByRole/getByLabelText; avoid querySelector / getByTestId unless necessary.
- Import the component with correct relative path.
- Name test file as <ComponentName>.test.tsx.
- Return JSON only, no markdown.
"""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


async def generate_tests(component_path: str, src: str, coverage: str):
    messages = build_messages(component_path, src, coverage)
    content = await chat(messages)
    try:
        payload = json.loads(content)
        assert "tests" in payload and isinstance(payload["tests"], list)
        return payload
    except Exception:
        # Fallback: wrap as single test file to avoid breaking client
        return {"tests": [{"filename": "Component.test.tsx", "code": content}]}


async def validate_source(file_path: str, src: str):
    messages = [
        {"role": "system",
            "content": "You are an RTL linter. Replace non-accessible selectors with accessible queries. Output JSON: {\"fixes\":[{\"file\":\"<path>\",\"patch\":\"<full_file_contents>\",\"reason\":\"<short>\"}]}"},
        {"role": "user", "content": f"File: {file_path}\n\nSource:\n``````"}
    ]
    content = await chat(messages, max_tokens=800, temperature=0.0)
    try:
        return json.loads(content)
    except Exception:
        return {"fixes": []}
