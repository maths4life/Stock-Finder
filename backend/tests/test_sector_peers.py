import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas.company import PeerComparisonItem


def test_peer_comparison_item_schema():
    item = PeerComparisonItem(
        symbol="CHENNPETRO",
        name="Chennai Petroleum Corp Ltd",
        price=650.5,
        changePct=1.25,
        marketCap="₹9,700 Cr",
        marketCapCr=9700.0,
        pe=5.4,
        pb=1.1,
        roe=22.5,
        roce=25.0,
        debtToEquity=0.35,
        overallScore=78.0,
        verdict="Strong Buy",
        isCurrent=True,
    )
    assert item.symbol == "CHENNPETRO"
    assert item.pe == 5.4
    assert item.isCurrent is True

