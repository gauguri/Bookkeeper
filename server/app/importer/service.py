from dataclasses import dataclass
from typing import List


@dataclass
class ImportWarning:
    message: str
    severity: str = "warning"


@dataclass
class ImportResult:
    created: int
    updated: int
    warnings: List[ImportWarning]


def validate_import_payload(payload: dict) -> List[ImportWarning]:
    warnings: List[ImportWarning] = []
    if not payload.get("company_id"):
        warnings.append(ImportWarning(message="Company ID is required", severity="error"))
    if payload.get("source_system") not in {"QBO", "QBD"}:
        warnings.append(ImportWarning(message="Unknown source system", severity="error"))
    return warnings


def perform_import(payload: dict) -> ImportResult:
    warnings = validate_import_payload(payload)
    if any(w.severity == "error" for w in warnings):
        return ImportResult(created=0, updated=0, warnings=warnings)
    return ImportResult(created=0, updated=0, warnings=warnings)
