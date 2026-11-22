"""Seed WorkHub with sample/demo data.

Usage:
    python -m scripts.seed            # writes to default db path
    python -m scripts.seed /path/db   # writes to specific db file
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db  # noqa: E402


SEED_SECTIONS = [
    {"name": "Observability", "icon": "📈", "color": "#22d3ee", "sort": 0},
    {"name": "Docs & References", "icon": "📚", "color": "#a78bfa", "sort": 1},
    {"name": "Day-to-Day", "icon": "⚡", "color": "#f59e0b", "sort": 2},
]

SEED_ITEMS = [
    # Observability
    {"type": "link", "title": "Grafana — Main Dashboards", "url": "https://localhost:3000/d/overview",
     "section": "Observability", "tags": ["grafana", "dashboards"], "pinned": True, "sort": 0},
    {"type": "link", "title": "Grafana — Latency Explorer", "url": "https://localhost:3000/d/latency",
     "section": "Observability", "tags": ["grafana", "latency"], "sort": 1},
    {"type": "link", "title": "Prometheus Targets", "url": "https://localhost:9090/targets",
     "section": "Observability", "tags": ["prometheus", "scrape"], "sort": 2},
    {"type": "link", "title": "Jaeger — Trace Lookup", "url": "https://localhost:16686/search",
     "section": "Observability", "tags": ["jaeger", "tracing"], "sort": 3},
    # Docs & References
    {"type": "link", "title": "RFC Tracker (Confluence)", "url": "https://confluence.example.com/rfcs",
     "section": "Docs & References", "tags": ["confluence", "rfcs"], "sort": 0},
    {"type": "link", "title": "Runbook — Service Restart", "url": "https://confluence.example.com/runbooks/restart",
     "section": "Docs & References", "tags": ["runbook", "ops"], "sort": 1},
    {"type": "note", "title": "Onboarding notes",
     "body": "VPN profile at ~/secrets/vpn.cfg\nGrafana org id is 42.\nAsk Kit about the dashboards token.",
     "section": "Docs & References", "tags": ["onboarding", "notes"], "sort": 2},
    # Day-to-Day
    {"type": "todo", "title": "Resolve P0 latency spike follow-ups", "due_date": "today",
     "section": "Day-to-Day", "tags": ["incident"], "sort": 0, "pinned": True},
    {"type": "todo", "title": "Submit expense report", "due_date": "tomorrow",
     "section": "Day-to-Day", "tags": ["admin"], "sort": 1},
    {"type": "todo", "title": "Prepare demo for Friday sync", "section": "Day-to-Day", "sort": 2},
    {"type": "note", "title": "Ideas for Q4",
     "body": "- Dashboard as new-tab home\n- Auto-start at login\n- SRE weekly digest",
     "section": "Day-to-Day", "tags": ["ideas", "brainstorm"], "sort": 3},
]


def seed(db_path=db.DEFAULT_DB_PATH):
    db.init_db(db_path)

    def resolve_section(conn, name):
        row = conn.execute(
            "SELECT id FROM sections WHERE name = ?", (name,)
        ).fetchone()
        return row["id"] if row else None

    with db.db_session(db_path) as conn:
        # Clear existing seed content (keep schema/meta).
        conn.execute("DELETE FROM items")
        conn.execute("DELETE FROM sections")

        for s in SEED_SECTIONS:
            conn.execute(
                """INSERT INTO sections (name, icon, color, sort)
                   VALUES (?, ?, ?, ?)""",
                (s["name"], s["icon"], s["color"], s["sort"]),
            )

        for it in SEED_ITEMS:
            due = it.get("due_date")
            # Resolve "today"/"tomorrow" to real dates so due-today works out of the box.
            if due == "today":
                due = __import__("datetime").date.today().isoformat()
            elif due == "tomorrow":
                from datetime import timedelta
                due = (__import__("datetime").date.today() + timedelta(days=1)).isoformat()

            conn.execute(
                """INSERT INTO items
                     (type, title, url, body, section_id, tags, due_date, done, pinned, is_md, sort)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    it["type"], it["title"], it.get("url"), it.get("body"),
                    resolve_section(conn, it["section"]),
                    db.encode_tags(it.get("tags", [])),
                    due,
                    1 if it.get("done") else 0,
                    1 if it.get("pinned") else 0,
                    1 if it.get("is_md") else 0,
                    it.get("sort", 0),
                ),
            )

    print(f"Seeded {len(SEED_ITEMS)} items across {len(SEED_SECTIONS)} sections → {db_path}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else db.DEFAULT_DB_PATH
    seed(target)
