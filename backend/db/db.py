import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# pool_pre_ping: issues a lightweight "SELECT 1" before each checkout to
#   detect stale/dropped connections (Supabase terminates idle connections
#   after ~5 minutes — without pre-ping these show up as cryptic
#   OperationalError: "server closed the connection unexpectedly").
# pool_recycle: forcibly close connections older than 5 minutes so they are
#   never handed to the application after the server has already dropped them.
# pool_size / max_overflow: bounded pool prevents connection pile-up under
#   load; 5+10 = 15 max concurrent DB connections, adequate for a personal
#   research tool behind FastAPI's default threadpool.
# connect_args connect_timeout: if Postgres (or the Supabase proxy) hangs
#   during the TCP handshake, fail fast at 10 s rather than blocking a
#   worker thread until the OS-level TCP timeout (~2 minutes).
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,        # recycle connections every 5 minutes
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10},
)