# WorkHub

**Your local personal command center.** A dark, modern, keyboard-first dashboard where you add your important URLs, quick linkouts, notes and todos once — and reuse them forever. Runs entirely on your machine; data stays local in SQLite.

![stack](https://img.shields.io/badge/React-18-blue) ![stack](https://img.shields.io/badge/FastAPI-Latest-009688) ![stack](https://img.shields.io/badge/SQLite-local-success)

---

## Features

- 🧭 **Sections** — group items (Observability, Docs, Day-to-Day…) with custom icon + accent color
- 🔗 **Links** — store any URL with auto-favicon preview; open with one click
- 📝 **Notes** — free-form notes that truncate with `-webkit-line-clamp`
- ✅ **Todos** — due dates, overdue / due-today highlighting, done toggling
- ⌘⇧P **Search palette** — instant fuzzy quick-jump across everything, keyboard-first
- 📌 **Pin to top** — keep your top dashboards always visible
- ☀️ **Due-today view** + optional desktop **notifications**
- 📦 **Export / Import** — one-click JSON backup & restore

## Stack

| Layer    | Tech                              |
| -------- | --------------------------------- |
| Frontend | React 18 + Vite 5, CSS variables  |
| Backend  | FastAPI + Python (Pydantic v2)    |
| Storage  | SQLite (single file, WAL mode)    |

## Quick start

```bash
# 1. One-time setup (creates backend/.venv, installs deps)
make install

# 2. Seed sample data (Grafana docs todos, etc.)
make seed

# 3. Run both servers (backend :8100, frontend :5273)
make run
```

Then open **http://localhost:5273**

> The backend API is also browsable standalone at **http://localhost:8100/docs**

## Install as an app (PWA)

WorkHub is a Progressive Web App — Chrome/Edge offer a one-click install so it
opens in its own window like a native app. The install button only appears on
the **production** server (where the service worker runs), so use it to install:

```bash
# Build the frontend, stage it into backend/, and serve the single-port app
make app          # → http://localhost:8100  (builds automatically)
```

Then, in Chrome (or Edge):

1. Open **http://localhost:8100**
2. Click the **install icon** (⊕) in the address bar, or
   **⋮ → Install WorkHub… / Install App…**
3. Launch it from your dock / taskbar / Start menu like any app

The app shell is cached by a service worker, so it works offline too; your data
still lives in local SQLite.

> **Ports:** if 8100 clashes with another project, run with
> `BACKEND_PORT=8123 make app`.

## Development

```bash
make backend   # FastAPI on :8100 (reload on; override with BACKEND_PORT=8123)
make frontend  # Vite on :5273 (proxies /api -> :8100; override with FRONTEND_PORT=5275)
make test      # backend pytest suite
```

## Project layout

```
workhub/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── db.py        # SQLite schema + migrations + helpers
│   │   ├── main.py      # FastAPI app, CRUD, search, export/import
│   │   └── schemas.py   # Pydantic models
│   ├── scripts/seed.py  # demo data
│   ├── tests/test_api.py
│   ├── data/workhub.db  # your data (created on first run, gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # shell: topbar, sidebar, views, settings
│   │   ├── store.jsx        # React context store + API client usage
│   │   ├── api.js           # fetch wrapper
│   │   ├── utils.js         # favicon/date helpers
│   │   ├── styles.css       # design system tokens
│   │   └── components/      # ItemCard, ItemModal, SearchPalette, SectionModal
│   ├── vite.config.js       # /api proxy -> :8100
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── manifest.webmanifest  # PWA install metadata
│   │   ├── sw.js                 # service worker (offline shell)
│   │   └── icons/                # PWA PNG icons (192, 512; apple 180)
│   └── package.json
├── Makefile
└── README.md
```

## API

| Method | Endpoint            | Description                        |
| ------ | ------------------- | ---------------------------------- |
| GET    | `/api/sections`     | List sections                      |
| POST   | `/api/sections`     | Create section                     |
| PATCH  | `/api/sections/:id` | Update section                     |
| DELETE | `/api/sections/:id` | Delete section (items → unsectioned) |
| GET    | `/api/items`        | List items (`?search=&due=today&pinned=` …) |
| POST   | `/api/items`        | Create item                        |
| PATCH  | `/api/items/:id`    | Update item                        |
| DELETE | `/api/items/:id`    | Delete item                        |
| GET    | `/api/export`       | Full JSON backup                   |
| POST   | `/api/import`       | Restore backup (replace mode)      |

## Keyboard shortcuts

| Shortcut    | Action                    |
| ----------- | ------------------------- |
| `⌘K` / `Ctrl+K` | Open search palette   |
| `⌘N` / `Ctrl+N` | New item             |
| `Esc`       | Close modal / palette     |

## Roadmap (v2 ideas)

- Chrome new-tab extension pointing at `localhost`
- Auto-start app at login
- Multi-user / cloud sync
- Embedded dashboard iframes

---

Local-first. Private. Yours. 🔒
