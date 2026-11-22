"""FastAPI application for WorkHub — local personal command center backend.

Exposes CRUD for sections & items, fuzzy search, due-today helper, and
JSON export/import for backups. Serves the built SPA from ../static when run
standalone (normally the Vite dev server proxies /api to this app).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .schemas import (
    ExportOut,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    SectionCreate,
    SectionOut,
    SectionUpdate,
)

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app(db_path=None) -> FastAPI:
    """Build the app; db_path injected so tests can use a temp database."""
    if db_path is None:
        db_path = db.DEFAULT_DB_PATH
    db.init_db(db_path)

    app = FastAPI(title="WorkHub API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5273", "http://127.0.0.1:5273"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Store resolved db path on app.state so endpoints use the same file.
    app.state.db_path = db_path

    # ------------------------------------------------------------------
    # Sections
    # ------------------------------------------------------------------
    @app.get("/api/sections", response_model=list[SectionOut])
    def list_sections():
        with db.db_session(app.state.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM sections ORDER BY sort ASC, name ASC"
            ).fetchall()
        return [db.row_to_section(r) for r in rows]

    @app.post("/api/sections", response_model=SectionOut, status_code=201)
    def create_section(payload: SectionCreate):
        try:
            with db.db_session(app.state.db_path) as conn:
                cur = conn.execute(
                    """INSERT INTO sections (name, icon, color, sort)
                       VALUES (?, ?, ?, ?)""",
                    (payload.name, payload.icon, payload.color, payload.sort),
                )
                section_id = cur.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Section with this name already exists")
        return fetch_section(section_id)

    @app.patch("/api/sections/{section_id}", response_model=SectionOut)
    def update_section(section_id: int, payload: SectionUpdate):
        fields = payload.model_dump(exclude_unset=True)
        if not fields:
            return fetch_section(section_id)
        sets = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [section_id]
        with db.db_session(app.state.db_path) as conn:
            cur = conn.execute(
                f"UPDATE sections SET {sets} WHERE id = ?", values
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Section not found")
        return fetch_section(section_id)

    @app.put("/api/sections/order")
    def reorder_sections(payload: dict):
        """Atomically set the display order of sections.

        Payload: {"ids": [3, 1, 4, 2]} — the new order (all section ids).
        Assigns sort = index for each, in one transaction.
        """
        ids = payload.get("ids")
        if not isinstance(ids, list) or not ids:
            raise HTTPException(status_code=400, detail="Expected {'ids': [id, ...]}")

        with db.db_session(app.state.db_path) as conn:
            existing = {r["id"] for r in conn.execute("SELECT id FROM sections").fetchall()}
            if not set(ids).issubset(existing):
                raise HTTPException(
                    status_code=400,
                    detail="ids must reference existing sections only",
                )
            for index, section_id in enumerate(ids):
                conn.execute(
                    "UPDATE sections SET sort = ? WHERE id = ?", (index, section_id)
                )
        return {"ok": True, "ids": ids}

    @app.delete("/api/sections/{section_id}", status_code=204)
    def delete_section(section_id: int):
        with db.db_session(app.state.db_path) as conn:
            # Unset section on items before deleting to avoid orphan / cascade loss.
            conn.execute(
                "UPDATE items SET section_id = NULL WHERE section_id = ?", (section_id,)
            )
            cur = conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Section not found")

    # ------------------------------------------------------------------
    # Items
    # ------------------------------------------------------------------
    @app.get("/api/items", response_model=list[ItemOut])
    def list_items(
        section_id: Optional[int] = None,
        type: Optional[str] = None,
        search: Optional[str] = Query(default=None, max_length=100),
        due: Optional[str] = None,
        pinned: Optional[bool] = None,
    ):
        clauses, values = [], []
        if section_id is not None:
            clauses.append("section_id = ?")
            values.append(section_id)
        if type in ("link", "note", "todo", "snippet"):
            clauses.append("type = ?")
            values.append(type)
        if due == "today":
            clauses.append("(done = 0 AND date(due_date) = date('now'))")
        if pinned is not None:
            clauses.append("pinned = ?")
            values.append(1 if pinned else 0)

        with db.db_session(app.state.db_path) as conn:
            where = (" AND " + " AND ".join(clauses)) if clauses else ""
            rows = conn.execute(
                f"""SELECT * FROM items
                    WHERE 1=1{where}
                    ORDER BY pinned DESC, done ASC, sort ASC, created_at DESC""",
                values,
            ).fetchall()

        items = [db.row_to_item(r) for r in rows]

        if search:
            items = fuzzy_search(items, search)
        return items

    @app.post("/api/items", response_model=ItemOut, status_code=201)
    def create_item(payload: ItemCreate):
        with db.db_session(app.state.db_path) as conn:
            if payload.section_id is not None:
                section = conn.execute(
                    "SELECT name FROM sections WHERE id = ?", (payload.section_id,)
                ).fetchone()
                if not section:
                    sections = conn.execute(
                        "SELECT id, name FROM sections ORDER BY sort, id"
                    ).fetchall()
                    available = ", ".join(f"{s['id']} ({s['name']})" for s in sections)
                    available = available or "none (create a section first)"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown section_id={payload.section_id}. "
                               f"Available: {available}",
                    )
            cur = conn.execute(
                """INSERT INTO items
                     (type, title, url, body, section_id, tags, due_date, done, pinned, is_md, sort, icon)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    payload.type,
                    payload.title,
                    payload.url,
                    payload.body,
                    payload.section_id,
                    db.encode_tags(payload.tags),
                    payload.due_date,
                    1 if payload.done else 0,
                    1 if payload.pinned else 0,
                    1 if payload.is_md else 0,
                    payload.sort,
                    payload.icon,
                ),
            )
            item_id = cur.lastrowid
        return fetch_item(item_id)

    @app.patch("/api/items/{item_id}", response_model=ItemOut)
    def update_item(item_id: int, payload: ItemUpdate):
        fields = payload.model_dump(exclude_unset=True)
        if not fields:
            return fetch_item(item_id)
        if "tags" in fields:
            fields["tags"] = db.encode_tags(fields["tags"])

        with db.db_session(app.state.db_path) as conn:
            if "section_id" in fields and fields["section_id"] is not None:
                section = conn.execute(
                    "SELECT name FROM sections WHERE id = ?", (fields["section_id"],)
                ).fetchone()
                if not section:
                    sections = conn.execute(
                        "SELECT id, name FROM sections ORDER BY sort, id"
                    ).fetchall()
                    available = ", ".join(f"{s['id']} ({s['name']})" for s in sections)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown section_id={fields['section_id']}. "
                               f"Available: {available or 'none (create a section first)'}",
                    )

        sets = ", ".join(f"{k} = ?" for k in fields)
        sets += ", updated_at = datetime('now')"
        values = list(fields.values()) + [item_id]
        with db.db_session(app.state.db_path) as conn:
            cur = conn.execute(f"UPDATE items SET {sets} WHERE id = ?", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Item not found")
        return fetch_item(item_id)

    @app.delete("/api/items/{item_id}", status_code=204)
    def delete_item(item_id: int):
        with db.db_session(app.state.db_path) as conn:
            cur = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Item not found")

    @app.post("/api/items/{item_id}/copy", response_model=ItemOut)
    def record_copy(item_id: int):
        """Bump usage stats when a command is copied (for 'most used' ordering)."""
        with db.db_session(app.state.db_path) as conn:
            cur = conn.execute(
                """UPDATE items
                       SET copy_count = copy_count + 1,
                           last_copied_at = datetime('now')
                     WHERE id = ?""",
                (item_id,),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Item not found")
        return fetch_item(item_id)

    # ------------------------------------------------------------------
    # Export / Import
    # ------------------------------------------------------------------
    @app.get("/api/export", response_model=ExportOut)
    def export_data():
        with db.db_session(app.state.db_path) as conn:
            sections = [db.row_to_section(r) for r in conn.execute(
                "SELECT * FROM sections ORDER BY sort ASC").fetchall()]
            items = [db.row_to_item(r) for r in conn.execute(
                "SELECT * FROM items ORDER BY sort ASC, created_at ASC").fetchall()]
        return {
            "app": "workhub",
            "schema_version": db.SCHEMA_VERSION,
            "exported_at": datetime.now(timezone.utc),
            "sections": sections,
            "items": items,
        }

    @app.post("/api/import")
    def import_data(payload: dict):
        """Replace-mode import: wipes existing data, restores from payload."""
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Invalid payload")

        items = payload.get("items", [])
        sections = payload.get("sections", [])

        with db.db_session(app.state.db_path) as conn:
            # Clear all existing data.
            conn.execute("DELETE FROM items")
            conn.execute("DELETE FROM sections")
            conn.execute(
                "DELETE FROM sqlite_sequence WHERE name IN ('items','sections')"
            )

            # Rebuild sections, remembering the new ids.
            id_map = {}
            for s in sections:
                cur = conn.execute(
                    """INSERT INTO sections (name, icon, color, sort)
                       VALUES (?, ?, ?, ?)""",
                    (s.get("name", "Untitled"), s.get("icon", "📁"),
                     s.get("color", "#22d3ee"), s.get("sort", 0)),
                )
                id_map[s.get("id")] = cur.lastrowid

            for it in items:
                section_id = it.get("section_id")
                conn.execute(
                    """INSERT INTO items
                         (type, title, url, body, section_id, tags, due_date, done, pinned, is_md, sort, icon)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        it.get("type", "note"),
                        it.get("title", ""),
                        it.get("url"),
                        it.get("body"),
                        id_map.get(section_id) if section_id in id_map else None,
                        db.encode_tags(it.get("tags", [])),
                        it.get("due_date"),
                        1 if it.get("done") else 0,
                        1 if it.get("pinned") else 0,
                        1 if it.get("is_md") else 0,
                        it.get("sort", 0),
                        it.get("icon"),
                    ),
                )
        return {"imported": len(items), "sections": len(sections)}

    # ------------------------------------------------------------------
    # Static SPA serving (for standalone `run`) — mounted last so /api wins.
    # ------------------------------------------------------------------
    static_dir = Path(__file__).resolve().parents[1] / "static"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    # ------------------------------------------------------------------
    # Internal fetch helpers
    # ------------------------------------------------------------------
    def fetch_section(section_id: int) -> dict:
        with db.db_session(app.state.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM sections WHERE id = ?", (section_id,)
            ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Section not found")
        return db.row_to_section(row)

    def fetch_item(item_id: int) -> dict:
        with db.db_session(app.state.db_path) as conn:
            row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        return db.row_to_item(row)

    return app


# Top-level convenience instance for `uvicorn app.main:app`.
app = create_app()


# ---------------------------------------------------------------------------
# Fuzzy search
# ---------------------------------------------------------------------------
def fuzzy_search(items: list[dict], query: str, threshold: float = 0.25) -> list[dict]:
    """Score items against query using a simple subsequence-based fuzzy match.

    Higher is better. Returns items above the threshold, ranked descending.
    """
    q = query.lower().strip()
    if not q:
        return items

    def score(item: dict) -> float:
        title = (item.get("title") or "").lower()
        body = (item.get("body") or "").lower()
        tags = " ".join(item.get("tags") or []).lower()

        s = 0.0
        if q in title:
            s += 1.0
        elif fuzzy_ratio(q, title) > 0.7:
            s += 0.6
        if q in body:
            s += 0.4
        if any(q in t for t in tags):
            s += 0.6
        return s

    scored = [(score(it), it) for it in items]
    results = [it for s, it in scored if s > 0]
    results.sort(key=lambda it: -next(s for s, i in scored if i is it))
    return results


def fuzzy_ratio(a: str, b: str) -> float:
    """Very small subsequence similarity (0..1)."""
    if not a or not b:
        return 0.0
    if a in b:
        return 1.0
    ia = ib = 0
    while ia < len(a) and ib < len(b):
        if a[ia] == b[ib]:
            ia += 1
        ib += 1
    return ia / len(a)
