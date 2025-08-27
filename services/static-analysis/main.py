from datetime import datetime
from utils import setup_logging
from schemas import (
    AnalysisRequest, AnalysisResponse, ComponentContext, ASTSummary, HealthResponse
)
from fastapi import FastAPI
import os
import sys
import re
from pathlib import Path
from typing import List, Dict, Any

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))


setup_logging("static-analysis")

app = FastAPI(
    title="Static Analysis Service",
    description="Analyzes React components and extracts context for test generation",
    version="1.0.0"
)


@app.get("/healthz", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        service="static-analysis",
        timestamp=datetime.now()
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_component(request: AnalysisRequest):
    """Analyze React component and extract context"""

    print(f"🔍 Analyzing: {os.path.basename(request.componentPath)}")

    source = request.componentSource
    file_path = request.componentPath

    # Extract component context
    context = ComponentContext(
        file_type=Path(file_path).suffix,
        is_component=_is_react_component(source),
        has_hooks=_has_hooks(source),
        has_props=_has_props(source),
        imports=_extract_imports(source),
        exports=_extract_exports(source)
    )

    # Extract AST summary
    ast_summary = ASTSummary(
        component_name=_extract_component_name(source),
        props_interface=_extract_props_interface(source),
        hooks_used=_extract_hooks(source),
        jsx_elements=_extract_jsx_elements(source),
        event_handlers=_extract_event_handlers(source)
    )

    print(f"   ✅ Component: {ast_summary.component_name}")
    print(f"   📋 Props: {bool(ast_summary.props_interface)}")
    print(f"   🪝 Hooks: {len(ast_summary.hooks_used)}")
    print(f"   🎯 Events: {len(ast_summary.event_handlers)}")

    return AnalysisResponse(
        context=context,
        ast_summary=ast_summary
    )


def _is_react_component(source: str) -> bool:
    """Check if source contains a React component"""
    patterns = [
        r'function\s+[A-Z]\w*\s*\(',
        r'const\s+[A-Z]\w*\s*[:=]\s*\(',
        r'export\s+(default\s+)?function\s+[A-Z]\w*',
        r'export\s+(default\s+)?(const\s+)?[A-Z]\w*'
    ]

    return any(re.search(pattern, source) for pattern in patterns)


def _has_hooks(source: str) -> bool:
    """Check if component uses React hooks"""
    hook_patterns = [
        r'useState', r'useEffect', r'useContext', r'useReducer',
        r'useCallback', r'useMemo', r'useRef', r'useImperativeHandle',
        r'useLayoutEffect', r'useDebugValue'
    ]

    return any(re.search(rf'\b{hook}\s*\(', source) for hook in hook_patterns)


def _has_props(source: str) -> bool:
    """Check if component accepts props"""
    patterns = [
        r'function\s+\w+\s*\(\s*\{[^}]+\}',
        r'function\s+\w+\s*\(\s*props\s*:',
        r'const\s+\w+\s*=\s*\(\s*\{[^}]+\}',
        r'const\s+\w+\s*=\s*\(\s*props\s*:'
    ]

    return any(re.search(pattern, source) for pattern in patterns)


def _extract_imports(source: str) -> List[str]:
    """Extract import statements"""
    imports = []
    for line in source.split('\n'):
        line = line.strip()
        if line.startswith('import ') and not line.startswith('import type'):
            imports.append(line)
    return imports


def _extract_exports(source: str) -> List[str]:
    """Extract export statements"""
    exports = []
    for line in source.split('\n'):
        line = line.strip()
        if line.startswith('export '):
            exports.append(line)
    return exports


def _extract_component_name(source: str) -> str:
    """Extract main component name"""
    patterns = [
        r'export\s+default\s+function\s+(\w+)',
        r'function\s+([A-Z]\w*)\s*\(',
        r'const\s+([A-Z]\w*)\s*[:=]',
        r'export\s+default\s+(\w+)'
    ]

    for pattern in patterns:
        match = re.search(pattern, source)
        if match:
            name = match.group(1)
            if name[0].isupper():
                return name

    return "Component"


def _extract_props_interface(source: str) -> str:
    """Extract props interface or type"""
    interface_match = re.search(
        r'interface\s+\w*Props\s*{([^}]+)}', source, re.DOTALL)
    if interface_match:
        return f"interface Props {{{interface_match.group(1)}}}"

    type_match = re.search(
        r'type\s+\w*Props\s*=\s*{([^}]+)}', source, re.DOTALL)
    if type_match:
        return f"type Props = {{{type_match.group(1)}}}"

    return None


def _extract_hooks(source: str) -> List[str]:
    """Extract React hooks used"""
    hooks = []
    hook_patterns = [
        r'(useState)\s*\(',
        r'(useEffect)\s*\(',
        r'(useContext)\s*\(',
        r'(useCallback)\s*\(',
        r'(useMemo)\s*\(',
        r'(useRef)\s*\(',
        r'(useReducer)\s*\('
    ]

    for pattern in hook_patterns:
        matches = re.findall(pattern, source)
        hooks.extend(matches)

    return list(set(hooks))  # Remove duplicates


def _extract_jsx_elements(source: str) -> List[str]:
    """Extract JSX element types"""
    elements = []

    # Find JSX elements
    jsx_pattern = r'<(\w+)(?:\s|>|/)'
    matches = re.findall(jsx_pattern, source)

    # Filter out HTML elements, keep components
    for element in matches:
        if element[0].isupper() or element in ['div', 'span', 'button', 'input', 'form', 'h1', 'h2', 'h3', 'p', 'ul', 'li']:
            elements.append(element)

    return list(set(elements))


def _extract_event_handlers(source: str) -> List[str]:
    """Extract event handler patterns"""
    handlers = []

    # Common event handler patterns
    patterns = [
        r'on(Click|Change|Submit|Focus|Blur|KeyDown|KeyUp|MouseEnter|MouseLeave)\s*=',
        r'handle\w+',
        r'on\w+\s*=\s*{[^}]*}',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, source, re.IGNORECASE)
        handlers.extend(matches)

    return list(set(handlers))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
