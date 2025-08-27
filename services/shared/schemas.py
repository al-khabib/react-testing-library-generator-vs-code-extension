from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime


class Goals(BaseModel):
    coverage: Literal["smoke", "interactions",
                      "comprehensive"] = "interactions"


class ComponentContext(BaseModel):
    file_type: str
    is_component: bool
    has_hooks: bool
    has_props: bool
    imports: List[str] = []
    exports: List[str] = []


class ASTSummary(BaseModel):
    component_name: Optional[str] = None
    props_interface: Optional[str] = None
    hooks_used: List[str] = []
    jsx_elements: List[str] = []
    event_handlers: List[str] = []


class GenerateRequest(BaseModel):
    componentPath: str
    componentSource: str
    goals: Goals


class EnhancedGenerateRequest(BaseModel):
    componentPath: str
    componentSource: str
    goals: Goals
    context: ComponentContext
    ast_summary: ASTSummary


class TestFile(BaseModel):
    filename: str
    code: str
    description: Optional[str] = None


class GenerateResponse(BaseModel):
    tests: List[TestFile]
    fixes: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class ValidateRequest(BaseModel):
    filePath: str
    source: str


class Fix(BaseModel):
    file: str
    patch: str
    reason: str
    confidence: float = 1.0


class ValidateResponse(BaseModel):
    fixes: List[Fix] = Field(default_factory=list)
    quality_score: float = 0.0
    suggestions: List[str] = Field(default_factory=list)


class AnalysisRequest(BaseModel):
    componentPath: str
    componentSource: str


class AnalysisResponse(BaseModel):
    context: ComponentContext
    ast_summary: ASTSummary


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: datetime
    version: str = "1.0.0"


class ServiceError(BaseModel):
    error: str
    service: str
    timestamp: datetime
    request_id: Optional[str] = None
