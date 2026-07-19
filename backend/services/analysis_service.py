"""Business logic for the Module 6 AI-style research engine.

Route layer (routes/analysis.py) stays thin, same convention as
routes/companies.py: parse params, call one function, return the
result. All the actual rule logic lives in analysis/engine.py and
analysis/rules/ — this module is just the service-layer seam other
services (company_service.py, discover_service.py, ...) also have.
"""
from typing import Optional

from analysis.engine import build_research_report


def get_company_analysis(symbol: str) -> Optional[dict]:
    return build_research_report(symbol)
