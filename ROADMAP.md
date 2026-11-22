# WorkHub — v2 Roadmap & Feature Plan

> Where the product should go next, grounded in the real codebase we have.

---

## North star

WorkHub started as "a single place for the stuff a developer juggles daily — bookmarks,
notes, Slack DMs, links, todos." v1 nailed the **destination** (a fast, local, keyboard-first
dashboard). v2 is about **two things**:

1. **Kill the capture friction** — entering something must take ≤2 seconds.
2. **Find everything from one place** — one search box over *all* data.

Everything else is polish that supports those two.

---

## Priority List (implementation order)

### 🥇 Tier 1 — Capture friction (do first)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **Paste-to-add** — press `⌘V` anywhere → detect clipboard URL → prefill Add modal (fetch page title) | Capture from 10s → 2s | **S** |
| 2 | **Search across everything** — ⌘⇧P palette also searches **docs** (localStorage) + section names + tags | One brain, one search box | **S–M** |
| 3 | **Scratch quick-note** — small corner popover, type + Enter, no modal | Fastest possible note | **S** |

### 🥈 Tier 2 — Find faster / ops cockpit

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 4 | **Recently opened strip** — last ~8 items/docs you opened, in the sidebar | You'll use it 20×/day | **S** |
| 5 | **Snooze / reminders on todos** — "remind me 9am tomorrow" + Notification API (already wired) | Closes the todo loop | **M** |
| 6 | **Recurring todos** — `every week/day` auto-creates the next when done | Cheap, huge perceived value | **S–M** |
| 7 | **Iframe-embedded link items** (Grafana dashboards render *inside* WorkHub) | Turns it into a real ops cockpit | **M** (CSP/security caveats) |

### 🥉 Tier 3 — Data hygiene

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 8 | **Chrome bookmarks import** — paste `bookmarks.html`, auto-create sections by folder | One-time onboarding win | **S–M** |
| 9 | **Archive section + dead-link check** — move stale items away; optional 404 checker | Keeps home screen honest | **M** |
| 10 | **Encrypted local secrets** — `crypto.subtle`-encrypted link/credentials block (you already made a "Securebin Password links" section) | Killer niche feature, fully local | **M** |

### 🧩 Tier 4 — Future / big-ticket (deferred intentionally)

- **Chrome new-tab extension** pointing at `localhost` (original v2 idea; packaging work)
- **DB-backed storage + multi-machine sync** (move docs out of localStorage; needed the moment you want it on work VM + laptop)
- **Browser context-menu "Add to WorkHub"**

---

## Quick architectural notes (what each feature touches)

```
frontend/src/
  utils.js          # #1 clipboard detect + title fetch helper
  store.jsx         # #2 unified search source (items + docs), #4 recent list
  App.jsx           # #1 ⌘V handler, #4 sidebar recent strip, #3 scratch popover
  docs/             # #2 include docs in palette (they live in localStorage)
  components/
    SearchPalette.jsx   # #2 extend result types (docs, sections)
    ItemModal.jsx       # #1 prefill from clipboard
  styles.css        # #3 popover, #4 strip, #7 iframe card
backend/
  app/main.py       # #5/#6 need a "reminders" resource OR reuse items due_date
                    # #9 archive flag/deadlink endpoint; #10 secrets endpoint (encrypted)
  tests/test_api.py # new tests for each backend addition
```

**Dependency changes**
- #7 iframe embed: no new dep (plain `<iframe>`); caveat — many dashboards send
  `X-Frame-Options: DENY` / CSP `frame-ancestors`, so embeds only work for lenient hosts.
- #10 secrets: use built-in `crypto.subtle` (Web Crypto) — zero new deps.
- Everything else: zero new deps.

---

## Suggested build order (3 slices)

**Slice A (recommended first sprint — ~half a day)**
1. Paste-to-add (`⌘V` → prefill modal)
2. Scratch quick-note popover
3. ⌘⇧P unified search (items + docs + sections)
4. Recently-opened sidebar strip

**Slice B (~a day)**
5. Snooze / reminders on todos (Notification API)
6. Recurring todos
7. Chrome bookmarks import

**Slice C (opt-in, per your appetite)**
8. Iframe-embedded dashboards
9. Archive + dead-link check
10. Encrypted local secrets (Securebin-style)

---

## Acceptance checks (mirror how we verified v1)

- `⌘V` while a URL is copied → Add modal opens pre-filled with title + URL → save → card appears
- `⌘⇧P` finds a **doc** by title/body and a **section** by name, alongside items
- Scratch note saved in <3s; visible immediately; persists after reload
- Sidebar "Recent" updates as you open things; survives reload
- Todo snooze fires a browser notification at the right time (or next poll)
- Backend tests stay green (`pytest`); production build passes (`npm run build`)
- No regressions to: drag-reorder, light/dark mode, docs tabs, export/import

---

*Add chosen items to repo issues/session notes as you pick them. Build incrementally, one feature per commit, verifying in the browser each time — same workflow that got v1 this far.*
