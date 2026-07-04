"""The tracked universe of companies.

Start small and curated on purpose — see project notes on why covering
the whole NSE/BSE universe on day one is the wrong goal. Add rows here
(or generate this list from the Kaggle seed file) as coverage grows.

symbol        -> internal symbol, matches companies.symbol in the DB
yahoo_ticker  -> what yfinance expects (.NS for NSE, .BO for BSE)
"""

UNIVERSE = [
    {"symbol": "POLYCAB",    "yahoo_ticker": "POLYCAB.NS",    "exchange": "NSE", "name": "Polycab India",         "sector": "Cables & FMEG"},
    {"symbol": "TATAMOTORS", "yahoo_ticker": "TATAMOTORS.NS", "exchange": "NSE", "name": "Tata Motors",            "sector": "Automobiles"},
    {"symbol": "HAL",        "yahoo_ticker": "HAL.NS",        "exchange": "NSE", "name": "Hindustan Aeronautics",  "sector": "Defence"},
    {"symbol": "ZOMATO",     "yahoo_ticker": "ZOMATO.NS",     "exchange": "NSE", "name": "Zomato",                 "sector": "Consumer Internet"},
    {"symbol": "TATAELXSI",  "yahoo_ticker": "TATAELXSI.NS",  "exchange": "NSE", "name": "Tata Elxsi",             "sector": "IT Services"},
    {"symbol": "PIIND",      "yahoo_ticker": "PIIND.NS",      "exchange": "NSE", "name": "PI Industries",          "sector": "Specialty Chemicals"},
    {"symbol": "TRENT",      "yahoo_ticker": "TRENT.NS",      "exchange": "NSE", "name": "Trent Ltd",              "sector": "Retail"},
    {"symbol": "HDFCBANK",   "yahoo_ticker": "HDFCBANK.NS",   "exchange": "NSE", "name": "HDFC Bank",              "sector": "Private Banks"},
    # Add more here, or write a one-off script that reads the Kaggle CSV's
    # symbol column and appends rows automatically once you've picked which
    # ~100-150 companies you actually want covered.
]
