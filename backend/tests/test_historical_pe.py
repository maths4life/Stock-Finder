import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from decimal import Decimal
from unittest.mock import MagicMock, patch
from services.financial_statements_service import get_historical_pe_range


def test_get_historical_pe_range_with_decimal():
    # Mock database connection and query returns
    mock_eps_rows = [
        {"period_end": MagicMock(year=2024), "eps": Decimal("25.0")},
        {"period_end": MagicMock(year=2023), "eps": Decimal("20.0")},
    ]
    mock_price_rows = [
        {"year": MagicMock(year=2024), "annual_high": Decimal("550.0"), "annual_low": Decimal("450.0")},
        {"year": MagicMock(year=2023), "annual_high": Decimal("440.0"), "annual_low": Decimal("360.0")},
    ]

    mock_conn = MagicMock()
    mock_conn.execute.return_value.mappings.return_value.all.side_effect = [
        mock_eps_rows,
        mock_price_rows,
    ]

    with patch("services.financial_statements_service.engine.connect") as mock_connect:
        mock_connect.return_value.__enter__.return_value = mock_conn

        # Test passing current_pe as a Decimal (e.g. from postgres numeric column)
        result = get_historical_pe_range("TEST", Decimal("22.5"))

        assert result is not None
        assert isinstance(result["pe_min"], float)
        assert isinstance(result["current_pe"], float)
        assert result["current_pe"] == 22.5
        assert isinstance(result["percentile"], int)
