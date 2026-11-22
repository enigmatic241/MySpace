import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402


@pytest.fixture()
def client(tmp_path):
    """Test client backed by an isolated temp SQLite database."""
    db_file = tmp_path / "test.db"
    app = create_app(db_path=db_file)
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

def test_create_and_list_sections(client):
    r = client.post("/api/sections", json={"name": "Obs", "icon": "📈", "color": "#22d3ee"})
    assert r.status_code == 201
    section = r.json()
    assert section["name"] == "Obs"
    assert section["id"] == 1

    r = client.get("/api/sections")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Obs"


def test_duplicate_section_returns_409(client):
    client.post("/api/sections", json={"name": "Obs"})
    r = client.post("/api/sections", json={"name": "Obs"})
    assert r.status_code == 409


def test_update_and_delete_section(client):
    sid = client.post("/api/sections", json={"name": "Obs"}).json()["id"]
    r = client.patch(f"/api/sections/{sid}", json={"color": "#ff0000"})
    assert r.status_code == 200
    assert r.json()["color"] == "#ff0000"

    r = client.delete(f"/api/sections/{sid}")
    assert r.status_code == 204
    assert client.get("/api/sections").json() == []


def test_reorder_sections(client):
    ids = [client.post("/api/sections", json={"name": f"S{i}"}).json()["id"] for i in range(3)]
    # Reverse order
    r = client.put("/api/sections/order", json={"ids": list(reversed(ids))})
    assert r.status_code == 200
    assert r.json()["ok"] is True

    ordered = [s["id"] for s in client.get("/api/sections").json()]
    assert ordered == list(reversed(ids))

    # Bad payloads
    assert client.put("/api/sections/order", json={"ids": []}).status_code == 400
    assert client.put("/api/sections/order", json={"ids": [99999]}).status_code == 400
    assert client.put("/api/sections/order", json={"nope": 1}).status_code == 400


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

def _seed_section_and_item(client):
    sid = client.post("/api/sections", json={"name": "Obs"}).json()["id"]
    r = client.post("/api/items", json={
        "type": "link",
        "title": "Grafana Overview",
        "url": "https://grafana.local",
        "section_id": sid,
        "tags": ["grafana", "dashboards"],
    })
    assert r.status_code == 201
    return sid, r.json()


def test_item_crud(client):
    sid, item = _seed_section_and_item(client)
    assert item["tags"] == ["grafana", "dashboards"]
    assert item["is_md"] is False  # default

    r = client.patch(f"/api/items/{item['id']}", json={"done": True, "pinned": True})
    assert r.status_code == 200
    assert r.json()["done"] is True
    assert r.json()["pinned"] is True

    r = client.delete(f"/api/items/{item['id']}")
    assert r.status_code == 204
    assert client.get("/api/items").json() == []


def test_item_is_md_flag(client):
    sid = client.post("/api/sections", json={"name": "Docs"}).json()["id"]
    r = client.post("/api/items", json={
        "type": "note",
        "title": "Markdown doc",
        "body": "# Heading\n\n- [x] item",
        "is_md": True,
        "section_id": sid,
    })
    assert r.status_code == 201
    assert r.json()["is_md"] is True

    # Toggle it off via update
    r = client.patch(f"/api/items/{r.json()['id']}", json={"is_md": False})
    assert r.status_code == 200
    assert r.json()["is_md"] is False


def test_item_requires_known_section(client):
    r = client.post("/api/items", json={
        "type": "note", "title": "x", "section_id": 999,
    })
    assert r.status_code == 400


def test_search(client):
    _seed_section_and_item(client)
    client.post("/api/items", json={"type": "todo", "title": "Submit expense report",
                                    "tags": ["admin"]})
    client.post("/api/items", json={"type": "note", "title": "Ideas for Q4",
                                    "body": "dashboard as new-tab home"})

    r = client.get("/api/items", params={"search": "grafana"})
    titles = [i["title"] for i in r.json()]
    assert "Grafana Overview" in titles

    r = client.get("/api/items", params={"search": "expense"})
    assert r.json()[0]["title"] == "Submit expense report"

    # Partial / fuzzy: "q4" should match "Ideas for Q4"
    r = client.get("/api/items", params={"search": "q4"})
    assert any("Ideas" in i["title"] for i in r.json())


def test_due_today_helper(client):
    from datetime import date
    _seed_section_and_item(client)
    client.post("/api/items", json={
        "type": "todo", "title": "Due today", "due_date": date.today().isoformat(),
        "done": False,
    })
    client.post("/api/items", json={
        "type": "todo", "title": "Done today", "due_date": date.today().isoformat(),
        "done": True,
    })
    client.post("/api/items", json={
        "type": "todo", "title": "Due another day", "due_date": "2030-01-01",
        "done": False,
    })

    r = client.get("/api/items", params={"due": "today"})
    titles = [i["title"] for i in r.json()]
    assert "Due today" in titles
    assert "Done today" not in titles
    assert "Due another day" not in titles


# ---------------------------------------------------------------------------
# Export / Import
# ---------------------------------------------------------------------------

def test_export_roundtrip(client):
    sid = client.post("/api/sections", json={"name": "Obs"}).json()["id"]
    client.post("/api/items", json={
        "type": "link", "title": "Grafana", "url": "https://grafana.local",
        "section_id": sid, "tags": ["obs"],
    })

    exported = client.get("/api/export").json()
    assert exported["app"] == "workhub"
    assert len(exported["sections"]) == 1
    assert len(exported["items"]) == 1
    old_item_id = exported["items"][0]["id"]
    old_section_id = exported["sections"][0]["id"]

    # Add extra junk, then restore from export (replace mode).
    client.post("/api/sections", json={"name": "Junk"})
    client.post("/api/items", json={"type": "note", "title": "temp"})

    r = client.post("/api/import", json=exported)
    assert r.status_code == 200
    assert r.json()["imported"] == 1
    assert r.json()["sections"] == 1

    sections = client.get("/api/sections").json()
    items = client.get("/api/items").json()
    assert len(sections) == 1 and sections[0]["name"] == "Obs"
    assert len(items) == 1 and items[0]["title"] == "Grafana"
    # New ids assigned on import (replace-mode), item still linked to section.
    assert items[0]["section_id"] is not None


def test_health_check(client):
    r = client.get("/api/sections")
    assert r.status_code == 200
