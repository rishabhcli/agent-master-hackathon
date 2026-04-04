#!/usr/bin/env python3
"""Apply the v2 schema migration to InsForge via the REST API.

Usage:
    python apply_schema_v2.py

Reads MASTERBUILD_INSFORGE_URL and MASTERBUILD_INSFORGE_TOKEN from .env.local.
Tries multiple API endpoints: /api/database/sql, /api/database/rpc/exec_sql.
"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local", override=True)

BASE_URL = os.getenv("MASTERBUILD_INSFORGE_URL", "").rstrip("/")
TOKEN = os.getenv("MASTERBUILD_INSFORGE_TOKEN", "").strip()

if not BASE_URL or not TOKEN:
    print("Error: Set MASTERBUILD_INSFORGE_URL and MASTERBUILD_INSFORGE_TOKEN in .env.local")
    sys.exit(1)

SQL_FILE = Path(__file__).resolve().parent / "insforge" / "masterbuild_schema_v2.sql"

if not SQL_FILE.is_file():
    print(f"Error: Migration file not found: {SQL_FILE}")
    sys.exit(1)

sql = SQL_FILE.read_text(encoding="utf-8")

print(f"Applying migration from {SQL_FILE.name}...")
print(f"Target: {BASE_URL}")

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# Try multiple API paths that InsForge might expose
API_PATHS = [
    ("/api/database/sql", lambda s: {"query": s}),
    ("/api/database/rpc/exec_sql", lambda s: {"query": s}),
    ("/api/database/rpc/run_sql", lambda s: {"sql": s}),
]

with httpx.Client(base_url=BASE_URL, headers=headers, timeout=60) as client:
    for path, payload_fn in API_PATHS:
        try:
            response = client.post(path, json=payload_fn(sql))
            if response.status_code in (200, 201, 204):
                print(f"✅ Migration applied successfully via {path}")
                sys.exit(0)
            else:
                print(f"  {path} returned {response.status_code}: {response.text[:200]}")
        except Exception as e:
            print(f"  {path} error: {e}")

    print("\n⚠️  Could not apply migration via REST API.")
    print("Apply manually using the InsForge MCP run-raw-sql tool with the contents of:")
    print(f"  {SQL_FILE}")
    sys.exit(1)
