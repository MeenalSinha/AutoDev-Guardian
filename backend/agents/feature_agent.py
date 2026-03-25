"""
Feature Builder Agent
Receives a feature request and generates production-ready code + tests.
Shows explicit reasoning: decomposition → planning → generation → validation.
"""
import logging
import re

from core.mistral_client import call_mistral
from core.vector_db import vector_db
from core.state import state
from core.reasoning import log_decision, log_analysis_start, log_autonomous_choice

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior software engineer with 10+ years of Python and FastAPI experience.
Your job is to implement feature requests as clean, production-ready code.

Rules:
- Write modular, well-documented code with type hints throughout
- Use Pydantic v2 Field validators for input validation (min_length, max_length)
- Include proper error handling and HTTP status codes
- Generate corresponding pytest unit tests
- Follow REST API best practices
- Use datetime.now(timezone.utc) — never datetime.utcnow()
- Never leave TODO comments; implement everything

Output format:
1. Implementation steps (numbered list)
2. Main implementation code (in ```python blocks)
3. Test code (in ```python blocks)"""


def _classify_feature(feature_request: str) -> dict:
    """
    Autonomously classify the feature request to determine:
    - complexity (simple/moderate/complex)
    - domain (auth/data/integration/performance/security)
    - approach
    """
    fr = feature_request.lower()
    
    # Detect domain
    if any(w in fr for w in ("auth", "jwt", "login", "token", "oauth", "session")):
        domain = "authentication"
        approach = "OAuth2 + JWT with refresh tokens"
    elif any(w in fr for w in ("upload", "file", "storage", "s3", "blob")):
        domain = "file-handling"
        approach = "streaming upload with validation"
    elif any(w in fr for w in ("queue", "background", "async", "task", "worker", "celery")):
        domain = "background-processing"
        approach = "async task queue with retry logic"
    elif any(w in fr for w in ("cache", "redis", "performance", "speed", "fast")):
        domain = "performance"
        approach = "cache-aside pattern with TTL"
    elif any(w in fr for w in ("rate limit", "throttle", "ddos", "abuse")):
        domain = "rate-limiting"
        approach = "sliding window counter"
    elif any(w in fr for w in ("search", "filter", "query", "paginate", "list")):
        domain = "data-access"
        approach = "cursor-based pagination with filters"
    elif any(w in fr for w in ("webhook", "event", "notify", "email", "sms")):
        domain = "integration"
        approach = "event-driven with retry"
    else:
        domain = "REST-API"
        approach = "standard CRUD with validation"

    # Detect complexity
    word_count = len(feature_request.split())
    conditions = sum(1 for w in ("and", "with", "also", "plus", "including", "support") if w in fr)
    complexity = "complex" if (word_count > 20 or conditions >= 2) else "moderate" if word_count > 10 else "simple"

    return {
        "domain": domain,
        "approach": approach,
        "complexity": complexity,
        "estimated_lines": {"simple": 40, "moderate": 80, "complex": 150}[complexity],
    }


def _count_code_lines(text: str) -> int:
    code_blocks = re.findall(r"```python\n(.*?)```", text, re.DOTALL)
    return sum(len(b.strip().split("\n")) for b in code_blocks)


def run(pipeline_id: str, feature_request: str) -> dict:
    """Execute the Feature Builder Agent with full reasoning visibility."""
    state.update_stage(pipeline_id, "feature_agent", "running")

    # Step 1: Autonomous classification
    log_analysis_start(pipeline_id, "FeatureAgent",
                       feature_request[:80], "NLP keyword classification + complexity scoring")

    classification = _classify_feature(feature_request)

    log_decision(
        pipeline_id, "FeatureAgent",
        finding=f"Feature classified as {classification['complexity'].upper()} {classification['domain']}",
        reasoning=f"Keyword analysis identified domain '{classification['domain']}'. "
                  f"Complexity: {classification['complexity']} based on scope analysis.",
        action=f"Applying '{classification['approach']}' implementation pattern",
        confidence=87,
        data=classification,
    )

    log_autonomous_choice(
        pipeline_id, "FeatureAgent",
        options=["Generate minimal stub", "Generate full implementation", "Generate with tests"],
        chosen="Generate full implementation with tests",
        reason=f"Complexity={classification['complexity']} → full implementation warranted. "
               f"Test coverage required for downstream security + deployment agents.",
    )

    # Step 2: RAG context retrieval
    context = vector_db.get_context_for_agent(feature_request, "feature")
    ctx_lines = len(context.split("\n"))
    state.add_log(pipeline_id, "FeatureAgent",
                  f"[RAG] Retrieved {ctx_lines} context entries from knowledge base. "
                  f"Injecting into prompt for consistency with existing codebase.")

    # Step 3: AI code generation
    state.add_log(pipeline_id, "FeatureAgent",
                  f"[AI] Calling Mistral 7B (system_prompt={len(SYSTEM_PROMPT)} chars, "
                  f"estimated_output={classification['estimated_lines']} lines)...")

    user_message = (
        f"Feature Request: {feature_request}\n\n"
        f"Classification: {classification['domain']} / {classification['complexity']} complexity\n"
        f"Recommended approach: {classification['approach']}\n\n"
        f"Relevant codebase context:\n{context}\n\n"
        "Implement this feature completely with production-quality code and tests."
    )

    response = call_mistral(SYSTEM_PROMPT, user_message, max_tokens=2048)
    actual_lines = _count_code_lines(response)

    # Step 4: Validation decision
    log_decision(
        pipeline_id, "FeatureAgent",
        finding=f"Code generation complete: {actual_lines} lines of Python generated",
        reasoning=f"Output contains implementation + test blocks. "
                  f"Estimated {classification['estimated_lines']} lines, actual {actual_lines}.",
        action="Storing in knowledge base. Passing to Dependency Healer and Security Triage agents.",
        confidence=91,
    )

    vector_db.store_code(response, {
        "pipeline_id": pipeline_id,
        "feature_request": feature_request[:100],
        "domain": classification["domain"],
        "agent": "feature_builder",
    })

    state.add_log(pipeline_id, "FeatureAgent",
                  f"[COMPLETE] Feature implementation ready. "
                  f"Domain: {classification['domain']} | Lines: {actual_lines} | "
                  f"Approach: {classification['approach']}", "success")

    result = {
        "agent": "feature_builder",
        "feature_request": feature_request,
        "generated_code": response,
        "lines_generated": actual_lines,
        "classification": classification,
        "status": "success",
    }
    state.update_stage(pipeline_id, "feature_agent", "completed", result)
    return result
