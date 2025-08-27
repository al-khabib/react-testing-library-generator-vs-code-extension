import httpx
import logging
import json
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ServiceClient:
    def __init__(self, base_url: str, service_name: str):
        self.base_url = base_url.rstrip('/')
        self.service_name = service_name
        self.client = httpx.AsyncClient(timeout=60.0)

    async def post(self, endpoint: str, data: Dict[str, Any], retries: int = 3) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"

        for attempt in range(retries):
            try:
                logger.info(
                    f"[{self.service_name}] POST {url} (attempt {attempt + 1})")

                response = await self.client.post(
                    url,
                    json=data,
                    headers={"Content-Type": "application/json"}
                )

                response.raise_for_status()
                result = response.json()

                logger.info(
                    f"[{self.service_name}] Success: {response.status_code}")
                return result

            except httpx.TimeoutException:
                logger.warning(
                    f"[{self.service_name}] Timeout on attempt {attempt + 1}")
                if attempt == retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)

            except httpx.HTTPStatusError as e:
                logger.error(
                    f"[{self.service_name}] HTTP {e.response.status_code}: {e.response.text}")
                if e.response.status_code >= 500 and attempt < retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise

            except Exception as e:
                logger.error(f"[{self.service_name}] Error: {str(e)}")
                if attempt == retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)

    async def get(self, endpoint: str) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"

        try:
            response = await self.client.get(url)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"[{self.service_name}] GET {url} failed: {str(e)}")
            raise

    async def close(self):
        await self.client.aclose()


def setup_logging(service_name: str):
    logging.basicConfig(
        level=logging.INFO,
        format=f'%(asctime)s - {service_name} - %(name)s - %(levelname)s - %(message)s'
    )


def get_request_id() -> str:
    from uuid import uuid4
    return str(uuid4())[:8]
