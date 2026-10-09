"""One problem taxonomy (categories + workflow stages). Mirrors config/taxonomy.ts; tests/engine/test_taxonomy.py
checks both agree. Classification is descriptive only: it never changes detection."""

from __future__ import annotations

from typing import Any

CATEGORIES = ["customer", "supply", "service", "finance", "field", "quality", "data", "opportunity"]
CATEGORY_LABEL = {
    "customer": "Customer relationship", "supply": "Supply & stock", "service": "Service & support",
    "finance": "Payment & finance", "field": "Field coverage", "quality": "Quality & safety",
    "data": "Data quality", "opportunity": "Opportunity",
}
CAUSE_TO_CATEGORY = {
    "supplier_delay": "supply", "channel_stockout": "supply", "inventory_mismatch": "supply",
    "batch_quality": "quality", "field_coverage_gap": "field", "payment_stress": "finance",
    "workforce_overload": "service", "support_capacity": "service", "demand_shift": "opportunity",
    "data_quality": "data",
}
DRIVER_TO_CATEGORY = {
    "supply": "supply", "service": "service", "finance": "finance", "field": "field",
    "quality": "quality", "commercial": "customer", "data_health": "data",
}
STAGES = ["detected", "investigating", "plan_ready", "awaiting_approval", "in_progress", "outcome_recorded", "learned"]
STAGE_LABEL = {
    "detected": "Detected", "investigating": "Investigating", "plan_ready": "Plan ready",
    "awaiting_approval": "Awaiting approval", "in_progress": "In progress",
    "outcome_recorded": "Outcome recorded", "learned": "Learned",
}


def category_of(kind: str, regulatory: bool, cause: str | None, driver: str | None) -> str:
    """Investigated cause wins; otherwise the descriptive driver. Opportunity and QA routing are fixed."""
    if kind == "opportunity":
        return "opportunity"
    if regulatory:
        return "quality"
    if cause and cause in CAUSE_TO_CATEGORY:
        return CAUSE_TO_CATEGORY[cause]
    return DRIVER_TO_CATEGORY.get(driver or "", "customer")


def stage_of(state: dict[str, Any], plan: dict[str, Any] | None, has_outcome: bool, learned: bool) -> str:
    status = state.get("status", "detected")
    if learned:
        return "learned"
    if has_outcome or status == "resolved":
        return "outcome_recorded"
    if status == "executing" or (plan and plan.get("status") in ("approved", "modified")):
        return "in_progress"
    if plan and plan.get("status") == "awaiting_approval":
        return "awaiting_approval"
    if state.get("investigation"):
        return "plan_ready"
    return "detected"
