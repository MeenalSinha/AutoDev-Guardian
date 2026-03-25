"""
Agent Reasoning Logger

Makes AI decision-making visible to judges and users.
Every agent call produces structured DECISION logs that show:
  - What the agent found
  - Why it made its choice
  - Confidence level
  - Action taken

These appear in the live log feed as [DECISION] entries.
"""
import json
from typing import Any, Optional
from core.state import state


def log_decision(
    pipeline_id: str,
    agent: str,
    finding: str,
    reasoning: str,
    action: str,
    confidence: int,          # 0-100
    severity: Optional[str] = None,
    data: Optional[Any] = None,
):
    """
    Emit a structured [DECISION] log entry that judges can see.
    Format mirrors what a real autonomous system would show.
    """
    lines = [f"[DECISION] {finding}"]
    if severity:
        lines.append(f"  Severity   : {severity}")
    lines.append(f"  Reasoning  : {reasoning}")
    lines.append(f"  Action     : {action}")
    lines.append(f"  Confidence : {confidence}%")
    if data:
        lines.append(f"  Details    : {json.dumps(data, default=str)[:120]}")

    message = "\n".join(lines)
    level = "warning" if severity in ("HIGH", "CRITICAL") else "info"
    state.add_log(pipeline_id, agent, message, level)


def log_analysis_start(pipeline_id: str, agent: str, target: str, method: str):
    state.add_log(pipeline_id, agent,
                  f"[ANALYSIS] Examining: {target}\n  Method: {method}", "info")


def log_iteration(pipeline_id: str, agent: str, iteration: int, total: int,
                  metric_name: str, before: float, after: float, unit: str = "ms"):
    delta = before - after
    pct = (delta / before * 100) if before else 0
    arrow = "improved" if delta > 0 else "regressed"
    state.add_log(
        pipeline_id, agent,
        f"[ITERATION {iteration}/{total}] {metric_name}: "
        f"{before:.2f}{unit} → {after:.2f}{unit} "
        f"({'+' if delta > 0 else ''}{pct:.1f}% {arrow})",
        "success" if delta > 0 else "info",
    )


def log_autonomous_choice(pipeline_id: str, agent: str, options: list,
                           chosen: str, reason: str):
    """Shows autonomous decision between alternatives — key for judges."""
    opts_str = " | ".join(options)
    state.add_log(
        pipeline_id, agent,
        f"[AUTONOMOUS CHOICE]\n"
        f"  Options    : {opts_str}\n"
        f"  Chosen     : {chosen}\n"
        f"  Reason     : {reason}",
        "info",
    )
