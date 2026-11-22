"""SQLite database layer for WorkHub.

Handles connection management, schema creation and versioned migrations.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# Default location for the database file (can be overridden in tests).
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "workhub.db"

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '📁',
    color TEXT NOT NULL DEFAULT '#22d3ee',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('link', 'note', 'todo', 'snippet')),
    title TEXT NOT NULL,
    url TEXT,
    body TEXT,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    tags TEXT NOT NULL DEFAULT '[]',
    due_date TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    is_md INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_section ON items(section_id);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
"""


def get_connection(db_path: Path | str) -> sqlite3.Connection:
    """Open a SQLite connection with sensible pragmas."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db_session(db_path: Path | str = DEFAULT_DB_PATH):
    """Context manager yielding a connection that auto-commits on success."""
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Path | str = DEFAULT_DB_PATH):
    """Create the database file, tables and meta row if missing."""
    # Ensure parent directory exists.
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    with db_session(db_path) as conn:
        conn.executescript(SCHEMA)
        # Lightweight migration: add missing columns for older databases
        # (created before a column was introduced).
        _ensure_column(conn, "items", "is_md",
                       "ALTER TABLE items ADD COLUMN is_md INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "items", "copy_count",
                       "ALTER TABLE items ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "items", "last_copied_at",
                       "ALTER TABLE items ADD COLUMN last_copied_at TEXT")
        _ensure_column(conn, "items", "icon",
                       "ALTER TABLE items ADD COLUMN icon TEXT")
        _migrate_type_check(conn)
        conn.execute(
            "INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )


def _migrate_type_check(conn):
    """Rebuild the items table if its type CHECK constraint predates 'snippet'.

    SQLite can't ALTER a CHECK constraint, so create the new table, copy rows,
    and swap. Only runs when the old constraint is detected (idempotent).
    """
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
    ).fetchone()
    if not row or "snippet" in (row["sql"] or ""):
        return
    # Copy by explicit column names: the physical order of existing rows can
    # differ (e.g. is_md was added later via ALTER TABLE), so `SELECT *`
    # would shift values into the wrong columns.
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(items)").fetchall()]
    col_sql = ", ".join(cols)
    conn.executescript(
        """
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE items_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK (type IN ('link', 'note', 'todo', 'snippet')),
            title TEXT NOT NULL,
            url TEXT,
            body TEXT,
            section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
            tags TEXT NOT NULL DEFAULT '[]',
            due_date TEXT,
            done INTEGER NOT NULL DEFAULT 0,
            pinned INTEGER NOT NULL DEFAULT 0,
            is_md INTEGER NOT NULL DEFAULT 0,
            sort INTEGER NOT NULL DEFAULT 0,
            copy_count INTEGER NOT NULL DEFAULT 0,
            last_copied_at TEXT,
            icon TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
""".rstrip()
        + f"\n        INSERT INTO items_new ({col_sql}) SELECT {col_sql} FROM items;"
        + """
        DROP TABLE items;
        ALTER TABLE items_new RENAME TO items;
        CREATE INDEX IF NOT EXISTS idx_items_section ON items(section_id);
        CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
        COMMIT;
        PRAGMA foreign_keys = ON;
        """
    )


def _ensure_column(conn, table: str, column: str, alter_sql: str):
    """Add a column to a table if it does not already exist."""
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(alter_sql)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def row_to_section(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "icon": row["icon"],
        "color": row["color"],
        "sort": row["sort"],
    }


def row_to_item(row: sqlite3.Row) -> dict:
    tags = row["tags"]
    try:
        tags = json.loads(tags) if tags else []
    except (TypeError, json.JSONDecodeError):
        tags = []
    item = {
        "id": row["id"],
        "type": row["type"],
        "title": row["title"],
        "url": row["url"],
        "body": row["body"],
        "section_id": row["section_id"],
        "tags": tags,
        "due_date": row["due_date"],
        "done": row["done"] == 1,
        "pinned": row["pinned"] == 1,
        "is_md": row["is_md"] == 1,
        "sort": row["sort"],
        "icon": row["icon"] if "icon" in row.keys() else None,
        "copy_count": row["copy_count"] if "copy_count" in row.keys() else 0,
        "last_copied_at": row["last_copied_at"] if "last_copied_at" in row.keys() else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    return item


def encode_tags(tags: list[str] | None) -> str:
    return json.dumps(tags or [])
