"""smolback — a tiny stateful backend for small GH Pages toys.

Small, typed REST surface over SQLite. No raw SQL on the wire. CORS + Origin
locked to the allowed front-end origin(s). Hard 1 GiB cap on the DB.
"""
import os
import re
import sqlite3
import threading

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = os.environ.get("SMOLBACK_DB", "/opt/smolback/data/smol.db")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("SMOLBACK_ORIGINS", "https://ziemghost.github.io").split(",")
    if o.strip()
]

PAGE_SIZE = 4096
MAX_PAGES = (1 * 1024 * 1024 * 1024) // PAGE_SIZE  # hard ~1 GiB ceiling
NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_lock = threading.Lock()


def connect():
    con = sqlite3.connect(DB_PATH, timeout=5)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute(f"PRAGMA max_page_count={MAX_PAGES}")
    return con


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = connect()
    con.execute(
        "CREATE TABLE IF NOT EXISTS counters ("
        "  name TEXT PRIMARY KEY,"
        "  value INTEGER NOT NULL DEFAULT 0"
        ")"
    )
    con.commit()
    con.close()


init_db()

app = FastAPI(title="smolback", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    max_age=86400,
)


def enforce_origin(request: Request):
    # Browsers always send Origin on cross-site requests; reject anything not
    # on the allowlist. (Spoofable by non-browsers — fine for small toys.)
    origin = request.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="origin not allowed")


def valid_name(name: str):
    if not NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="name must match [A-Za-z0-9_-]{1,64}")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/counter/{name}")
def get_counter(name: str, request: Request):
    enforce_origin(request)
    valid_name(name)
    with _lock:
        con = connect()
        row = con.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()
        con.close()
    return {"name": name, "value": row[0] if row else 0}


@app.post("/api/counter/{name}/add_one")
def add_one(name: str, request: Request):
    enforce_origin(request)
    valid_name(name)
    try:
        with _lock:
            con = connect()
            con.execute(
                "INSERT INTO counters(name, value) VALUES(?, 1) "
                "ON CONFLICT(name) DO UPDATE SET value = value + 1",
                (name,),
            )
            con.commit()
            value = con.execute(
                "SELECT value FROM counters WHERE name = ?", (name,)
            ).fetchone()[0]
            con.close()
    except sqlite3.OperationalError as e:
        if "full" in str(e).lower() or "max_page_count" in str(e).lower():
            raise HTTPException(status_code=507, detail="storage limit reached")
        raise
    return {"name": name, "value": value}
