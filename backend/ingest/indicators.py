"""Technical indicator calculations.

Ported directly from the previous Streamlit project's utils/indicators.py —
this logic was already correct, so it's reused unchanged rather than
rewritten. Kept separate from fetching and from DB writes so indicator
logic can evolve independently.
"""
import pandas as pd


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    df["MA20"] = df["Close"].rolling(20).mean()
    df["MA50"] = df["Close"].rolling(50).mean()
    df["MA200"] = df["Close"].rolling(200).mean()
    return df


def compute_vwap(df: pd.DataFrame) -> pd.DataFrame:
    """VWAP here is computed cumulatively over the full fetched window.
    For the ingestion job (which always stores full daily history) this is
    fine; if you later add an intraday view, slice the window before
    calling this, per the original project's note."""
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
    df["VWAP"] = (typical_price * df["Volume"]).cumsum() / df["Volume"].cumsum()
    return df


def detect_golden_cross(df: pd.DataFrame, lookback: int = 10) -> bool:
    """True if MA50 crossed above MA200 within the last `lookback` sessions."""
    if "MA50" not in df or "MA200" not in df:
        return False
    recent = df.dropna(subset=["MA50", "MA200"]).tail(lookback + 1)
    if len(recent) < 2:
        return False
    diff = recent["MA50"] - recent["MA200"]
    return bool((diff.iloc[:-1] < 0).any() and diff.iloc[-1] > 0)
