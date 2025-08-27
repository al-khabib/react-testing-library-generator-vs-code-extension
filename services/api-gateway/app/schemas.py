from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class Goals(BaseModel):
    coverage: Literal["smoke", "interactions", "edge"] = "interactions"


class GenerateRequest(BaseModel):
    componentPath: str
    componentSource: str
    goals: Goals


class TestFile(BaseModel):
    filename: str
    code: str


class GenerateResponse(BaseModel):
    tests: List[TestFile]
    fixes: Optional[list] = None
    warnings: Optional[List[str]] = None


class ValidateRequest(BaseModel):
    filePath: str
    source: str


class Fix(BaseModel):
    file: str
    patch: str
    reason: str


class ValidateResponse(BaseModel):
    fixes: List[Fix] = Field(default_factory=list)
