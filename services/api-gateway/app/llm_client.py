import os
import httpx
from typing import Any, Dict

OPENAI_BASE = os.getenv("OPENAI_BASE_URL", "http://localhost:8080/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "deepseek-coder-v2-lite-instruct")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "no-key-required")


async def chat(messages: list[dict[str, str]], max_tokens: int = 800, temperature: float = 0.2) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{OPENAI_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": OPENAI_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False
            },
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"]["message"]["content"]
