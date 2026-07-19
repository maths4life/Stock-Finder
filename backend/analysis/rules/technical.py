"""Technical-analysis rules for Module 6.

Reads fields company_service.py already computes (rsi, aboveEma50,
aboveEma200, goldenCross, volumeBreakout, trend, price) plus the extra
technical_snapshot columns analysis/helpers.get_extended_technicals
pulls (ma20/ma50/ma200/vwap/high52w/low52w). No MACD/ATR: neither
column exists on technical_snapshot in db/schema.sql, so none is
fabricated here — only real, stored indicators are used.
"""
from typing import Dict, List, Optional


def trend_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    above_50 = bool(fields.get("aboveEma50"))
    above_200 = bool(fields.get("aboveEma200"))
    golden_cross = bool(fields.get("goldenCross"))

    if above_50 and above_200:
        notes.append("Price is trading above both its 50-day and 200-day moving averages, an uptrend structure.")
    elif not above_50 and not above_200:
        notes.append("Price is trading below both its 50-day and 200-day moving averages, a downtrend structure.")
    else:
        notes.append("Price is positioned between its 50-day and 200-day moving averages, a transitional/sideways structure.")

    if golden_cross:
        notes.append("A recent golden cross (50-day average crossing above the 200-day average) reinforces the bullish structure.")

    return notes


def momentum_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    rsi = fields.get("rsi") or 0.0

    if rsi <= 0:
        return notes
    if rsi > 70:
        notes.append(f"RSI at {rsi:.0f} is in overbought territory, raising the odds of a near-term pullback.")
    elif rsi < 30:
        notes.append(f"RSI at {rsi:.0f} is in oversold territory, which can precede a bounce but also confirms weak momentum.")
    elif rsi >= 55:
        notes.append(f"RSI at {rsi:.0f} shows constructive, building momentum.")
    elif rsi <= 45:
        notes.append(f"RSI at {rsi:.0f} shows cooling momentum.")
    else:
        notes.append(f"RSI at {rsi:.0f} is neutral.")

    return notes


def volume_notes(fields: Dict) -> List[str]:
    if fields.get("volumeBreakout"):
        return ["Recent volume surged more than 1.5x the 20-day average, signaling a pickup in participation."]
    return ["Volume is trading in line with its 20-day average, no breakout signal currently."]


def moving_average_notes(fields: Dict, extended: Dict[str, Optional[float]]) -> List[str]:
    notes: List[str] = []
    price = fields.get("price") or 0.0
    ma20, ma50, ma200 = extended.get("ma20"), extended.get("ma50"), extended.get("ma200")
    vwap = extended.get("vwap")
    high52w, low52w = extended.get("high52w"), extended.get("low52w")

    if ma20 and ma50 and ma200:
        if ma20 > ma50 > ma200:
            notes.append(f"20/50/200-day moving averages are stacked in bullish order (₹{ma20:.1f} > ₹{ma50:.1f} > ₹{ma200:.1f}).")
        elif ma20 < ma50 < ma200:
            notes.append(f"20/50/200-day moving averages are stacked in bearish order (₹{ma20:.1f} < ₹{ma50:.1f} < ₹{ma200:.1f}).")

    if vwap and price:
        if price > vwap:
            notes.append(f"Price of ₹{price:.1f} is trading above VWAP (₹{vwap:.1f}), favoring buyers.")
        elif price < vwap:
            notes.append(f"Price of ₹{price:.1f} is trading below VWAP (₹{vwap:.1f}), favoring sellers.")

    if high52w and price:
        proximity_to_high = price / high52w if high52w else 0
        if proximity_to_high >= 0.95:
            notes.append(f"Trading within striking distance of its 52-week high of ₹{high52w:.1f}.")
    if low52w and price:
        proximity_to_low = price / low52w if low52w else 0
        if 0 < proximity_to_low <= 1.05:
            notes.append(f"Trading close to its 52-week low of ₹{low52w:.1f}, reflecting weak sentiment.")

    return notes
