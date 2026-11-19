import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")

TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


class LibsqlCursorWrapper:
    """Wraps libsql cursor to seamlessly serialize dates, datetimes, UUIDs,
    and Decimals into SQLite/libSQL-compatible types."""
    def __init__(self, cursor):
        self._cursor = cursor

    @staticmethod
    def _clean_val(v):
        from datetime import date, datetime
        from decimal import Decimal
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        if isinstance(v, Decimal):
            return float(v)
        if hasattr(v, "hex"):
            return str(v)
        return v

    def execute(self, statement, parameters=None):
        if parameters is not None:
            if isinstance(parameters, (list, tuple)):
                clean_params = [self._clean_val(v) for v in parameters]
            elif isinstance(parameters, dict):
                clean_params = {k: self._clean_val(v) for k, v in parameters.items()}
            else:
                clean_params = parameters
            return self._cursor.execute(statement, clean_params)
        return self._cursor.execute(statement)

    def executemany(self, statement, seq_of_parameters):
        clean_seq = []
        for params in seq_of_parameters:
            if isinstance(params, (list, tuple)):
                clean_seq.append([self._clean_val(v) for v in params])
            elif isinstance(params, dict):
                clean_seq.append({k: self._clean_val(v) for k, v in params.items()})
            else:
                clean_seq.append(params)
        return self._cursor.executemany(statement, clean_seq)

    def __iter__(self):
        return iter(self._cursor)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class LibsqlConnectionWrapper:
    """Lightweight DBAPI adapter allowing SQLAlchemy's SQLite dialect to seamlessly
    interact with modern libsql remote connections without requiring deprecated
    Rust compilation packages."""
    def __init__(self, conn):
        self._conn = conn

    def cursor(self, *args, **kwargs):
        return LibsqlCursorWrapper(self._conn.cursor(*args, **kwargs))

    def execute(self, statement, parameters=None):
        return self.cursor().execute(statement, parameters)

    def create_function(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def create_app_engine():
    if TURSO_DATABASE_URL and TURSO_AUTH_TOKEN:
        import libsql

        target = TURSO_DATABASE_URL
        if target.startswith("libsql://"):
            target = target.replace("libsql://", "https://")
        elif not target.startswith("https://") and not target.startswith("file:"):
            target = f"https://{target}"

        return create_engine(
            "sqlite://",
            creator=lambda: LibsqlConnectionWrapper(libsql.connect(target, auth_token=TURSO_AUTH_TOKEN)),
        )
    elif DATABASE_URL:
        return create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,        # recycle connections every 5 minutes
            pool_size=5,
            max_overflow=10,
            connect_args={"connect_timeout": 10},
        )
    else:
        raise RuntimeError("Neither TURSO_DATABASE_URL nor DATABASE_URL is configured.")


engine = create_app_engine()
