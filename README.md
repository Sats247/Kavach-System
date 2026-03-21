# 🛡️ Kavach — Digital Border Management System (DBMS)

> A unified, real-time intelligence and operations platform for India's border security forces, immigration officers, sea marshals, and humanitarian NGOs — built for the Megahackathon 2026.

---

## Features

- **Live Aircraft Map** — Real-time aircraft positions over India rendered on an interactive Leaflet map, fed via the OpenSky Network OAuth2 API with server-side token caching and bounding-box filtering.
- **Live Marine Traffic Map** — Embedded MarineTraffic AIS widget showing real-time vessel positions across the Indian Ocean, Arabian Sea, Bay of Bengal, and Malacca Strait.
- **Arrivals & Departures Flight Board** — Live international flights for 30 Indian airports sourced from AviationStack API, with filter by status (Delayed, En Route, Landed, Boarding, Cancelled) and stats bar.
- **Border Force Dashboards** — Dedicated portals for BSF, ITBP, SSB, Assam Rifles, and CISF — each showing force-specific refugee registrations, entry points, and watchlist events.
- **Refugee Registration** — Officers can register refugees at the border: captures personal details, entry point, help needs (medical, shelter, legal, child protection, education), assigns an NGO, and generates a unique Provisional ID (e.g. `PROV-BSF-2026-001234`).
- **Watchlist / Blacklist Check** — Instantly cross-check a passport number or name against the INTERPOL/intelligence-flagged entity database; returns risk score, blacklist reason, and status.
- **Passport OCR Scan** — Immigration officers can upload a passport image; the system uses Tesseract OCR + OpenCV to extract the passport number and MRZ, looks it up in the database, and returns a full verification report with simulated face-match score.
- **Traveler Search & Entry Grant** — Immigration officers can search all traveler records by name, passport number, nationality, or status, and grant or deny entry.
- **Sea Marshall Vessel Management** — View and manage the vessel traffic register for India's EEZ: flag suspicious vessels, issue intercept orders (auto-creates an incident), update vessel status, and log new vessels.
- **Incident Filing** — Sea marshals can file structured incidents (type, severity, location, description) linked to a vessel IMO number.
- **NGO Support Portal** — NGOs see only their assigned refugee cases; can acknowledge, update progress, and complete assignments with full case detail (help tags, medical needs, camp location).
- **Refugee Self-Service Portal** — Refugees can look up their own Provisional ID to see their registration status, assigned camp, NGO, rights (non-refoulement etc.), and emergency contact numbers.
- **Global Dashboard** — Aggregated KPIs: total entities processed, flagged count, refugees pending NGO aid, and open incidents. Interactive marker stats per entry point.
- **Cargo Throughput & Commodity Charts** — Bar and doughnut charts on the Sea Marshall dashboard showing port-level cargo volumes and commodity breakdown (Chart.js).
- **Multi-language UI** — Interface supports EN / हि (Hindi) via a client-side translation system (`translation.js`).
- **Role-Based Access Control** — Five distinct login paths (Border Patrol by force, Sea Marshall, Immigration Officer, NGO, Refugee) each routing to a tailored portal with session stored in `sessionStorage`.

---

## Tech Stack

| Library / Tool | Category | Why It's Used in This Project |
|---|---|---|
| **Flask 3.0** | Backend framework | Serves the entire application — REST API (9 blueprints) + static frontend from a single Python process on port 5050 |
| **flask-cors 4.0** | CORS middleware | Enables browser requests from the Leaflet/Chart.js frontend to the Flask API during local development |
| **python-dotenv 1.0** | Config | Loads `AVIATIONSTACK_KEY` and `FLASK_SECRET_KEY` from `.env` into `os.environ` at startup in `app.py` |
| **SQLite** (built-in) | Database | Stores all entities, refugee registrations, incidents, NGO assignments, and vessel statuses in `dbms.sqlite` — zero-dependency, WAL-mode enabled |
| **pytesseract** | OCR | Used in `immigration.py` to extract passport numbers and MRZ text from uploaded passport images for the document scan feature |
| **OpenCV (`opencv-python`)** | Image processing | Converts uploaded passport images to greyscale in `immigration.py` before passing to Tesseract for higher OCR accuracy |
| **Pillow** | Image I/O | Required by pytesseract to handle image decoding alongside OpenCV |
| **requests ≥2.31** | HTTP client | Used in `opensky.py` to fetch OAuth2 tokens and query the OpenSky REST API; used in `aviationstack.py` to fetch flight data |
| **Leaflet.js 1.9.4** | Interactive maps | Renders the live aircraft map in `map.js` with custom plane markers, popups, and bounding-box-scoped API calls to the OpenSky proxy |
| **Chart.js 4.4.0** | Data visualisation | Powers the cargo throughput bar chart and commodity doughnut chart on the Sea Marshall dashboard (`sea-marshall.js`) |
| **face-api.js 0.22.2** | Client-side ML | Loaded on the Immigration page to simulate a browser-side face detection overlay for the passport scan demo flow |
| **MarineTraffic embed** | Live vessel map | Embedded iframe widget in `sea-marshall.html` — displays real-time AIS vessel positions for the Indian Ocean without requiring a paid API key |
| **AviationStack API** | External REST API | Proxied via `aviationstack.py` — provides live international flight data for 30 Indian airports; server-side proxy avoids browser mixed-content (API is HTTP-only); results cached 5 min |
| **OpenSky Network API** | External REST API | Proxied via `opensky.py` using OAuth2 client-credentials flow; returns live aircraft state vectors for the India bounding box; token cached with 60s pre-expiry refresh |
| **Google Fonts — Inter** | Typography | Loaded via CDN in `global.css` and applied system-wide as the primary typeface |
| **Vanilla CSS + HTML** | Frontend | All UI built without a framework — custom design system in `global.css` with CSS variables, flex/grid layouts, and micro-animations |

---

## Architecture Overview

Kavach is a **monolithic Python/Flask application** that co-hosts the REST API and the static frontend from a single server. The frontend is plain HTML + Vanilla JS (no build step required) served directly from `dbms/frontend/` via Flask's `static_folder`. The backend is structured as nine Flask Blueprints, each responsible for a vertical slice of functionality (auth, border patrol, immigration, sea marshall, NGO, refugee, dashboard, OpenSky proxy, AviationStack proxy). All persistence is handled by a single **SQLite** database (`dbms.sqlite`) with five normalised tables. External real-time data enters via two REST proxies (OpenSky OAuth2 for aircraft, AviationStack for flights) and one embedded iframe (MarineTraffic for vessels). Communication between the frontend and backend is **REST over HTTP** — the frontend uses `fetch()` via a shared `apiFetch()` helper in `config.js`. There is no WebSocket layer; polling is used for live maps.

---

## Key Data Flows

### 1. Passport Scan → Verification Result (Immigration)
1. Officer uploads a passport photo via the immigration UI (`immigration.html`).
2. The file is `POST`ed to `/api/immigration/verify-passport` as `multipart/form-data`.
3. `immigration.py` reads the image bytes via `numpy`, decodes with **OpenCV**, converts to greyscale, and runs **Tesseract OCR** to extract text.
4. A regex searches the OCR output for a standard Indian passport number (Z-series) or MRZ checksum pattern.
5. The extracted passport number is queried against the `entities` table in **SQLite**.
6. The backend returns a JSON object with the entity record, MRZ validity, watchlist status, INTERPOL clear flag, and a simulated face-match score.
7. The frontend renders a full verification panel with a pass/fail badge and action buttons (Grant Entry / Detain).

### 2. Aircraft Position → Live Map Render (Border Patrol / Immigration)
1. When the live map tab is opened, `map.js` calls the Flask proxy `/api/opensky?lamin=…&lomax=…` every 30 seconds.
2. `opensky.py` checks an in-memory token cache; if expired, it `POST`s to the OpenSky OAuth2 token endpoint using credentials from `opensky-network credentials - livemap.json`.
3. With the bearer token, it `GET`s `/api/states/all` from OpenSky with the India bounding box params.
4. The raw state vectors are returned to the browser as JSON.
5. `map.js` iterates over each aircraft state, places a rotated SVG plane marker on the **Leaflet** map, and attaches a popup with callsign, altitude, speed, and heading.

### 3. Refugee Registration → NGO Assignment (Border Patrol → NGO Portal)
1. A border force officer fills the refugee registration form in the border patrol portal.
2. On submit, the form data is `POST`ed to `/api/border-patrol/register-refugee`.
3. `border_patrol.py` generates a unique Provisional ID (`PROV-{FORCE}-2026-{N}`), inserts the entity into `entities`, creates a `refugee_registrations` row, and creates an `ngo_assignments` row with status `Pending`.
4. The officer's UI displays the generated Provisional ID as a copyable code.
5. The assigned NGO can see the case in their portal (`/api/ngo/assignments`), update status (Acknowledged → In Progress → Completed), and the refugee can self-lookup via the Refugee Portal using just their Provisional ID.

---

## Getting Started

### Prerequisites
- **Python 3.11+** (project uses `.venv` at Python 3.14)
- **Tesseract OCR** installed on your system (`brew install tesseract` on macOS)
- An `.env` file at the project root (see Environment Variables below)
- The `opensky-network credentials - livemap.json` file at the project root (see below)

### Installation

```bash
# Clone the repository
git clone https://github.com/Sats247/Kavach-System.git
cd Kavach-System

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r dbms/backend/requirements.txt
```

### Environment Variables

Create a `.env` file in the **project root** (`Kavach-System/.env`):

| Variable | Description | Where to Get It |
|---|---|---|
| `AVIATIONSTACK_KEY` | API access key for live flight data | [aviationstack.com](https://aviationstack.com) → free tier |
| `FLASK_SECRET_KEY` | Secret used for Flask session signing | Generate any random string, e.g. `openssl rand -hex 32` |

Create `opensky-network credentials - livemap.json` in the **project root**:

```json
{
  "clientId": "your-opensky-client-id",
  "clientSecret": "your-opensky-client-secret"
}
```

Register at [opensky-network.org](https://opensky-network.org) → My OpenSky → Client Credentials.

### Running Locally

```bash
# From the project root, with .venv activated:
cd dbms/backend
python app.py
```

The app starts on **http://localhost:5050**. The login page is served at `/`.

---

## Project Structure

```
Kavach-System/
├── .env                                      # API keys (gitignored)
├── .gitignore                                # Excludes secrets, venv, cache
├── opensky-network credentials - livemap.json # OpenSky OAuth2 creds (gitignored)
│
└── dbms/
    ├── backend/
    │   ├── app.py                            # Flask app factory; registers all blueprints
    │   ├── database.py                       # SQLite connection, helper functions, api_response()
    │   ├── requirements.txt                  # Python dependencies
    │   ├── seed_data.sql                     # Schema + 350 seed entities (auto-runs on first start)
    │   ├── dbms.sqlite                       # SQLite database (auto-created)
    │   ├── vessels.json                      # Vessel registry (flat JSON, loaded by sea_marshall.py)
    │   ├── ngos.json                         # NGO list keyed by border force
    │   └── routes/
    │       ├── auth.py                       # POST /api/auth/login, /logout, /session
    │       ├── dashboard.py                  # KPIs, marker stats, entity type breakdown
    │       ├── border_patrol.py              # Refugee registration, watchlist check, refugee list
    │       ├── immigration.py                # Passport OCR scan, traveler search, grant entry
    │       ├── sea_marshall.py               # Vessel CRUD, flag, intercept, file incident
    │       ├── ngo.py                        # NGO assignment list, status update, counts
    │       ├── refugee.py                    # Provisional ID self-lookup
    │       ├── opensky.py                    # OAuth2 proxy for OpenSky aircraft API
    │       └── aviationstack.py              # Proxy + 5-min cache for AviationStack flights API
    │
    └── frontend/
        ├── index.html                        # Login gateway — role/sub-role selector
        ├── css/
        │   ├── global.css                    # Full design system: variables, layout, components
        │   ├── border-patrol.css             # Force portal styles
        │   ├── sea-marshall.css              # Vessel dashboard styles
        │   ├── login.css                     # Login page styles
        │   └── ngo-portal.css                # NGO portal styles
        ├── js/
        │   ├── config.js                     # API_BASE, camp/force/entry-point constants, apiFetch()
        │   ├── auth.js                       # Session guard, sidebar user info, logout
        │   ├── map.js                        # Leaflet live aircraft map, OpenSky polling
        │   ├── flights-board.js              # AviationStack flight board, filters, stats
        │   ├── border-patrol.js              # Registration form, watchlist check, refugee table
        │   ├── immigration.js                # Passport scan UI, traveler search, OCR result panel
        │   ├── sea-marshall.js               # Vessel table, intercept/flag actions, Chart.js charts
        │   ├── marine-map.js                 # Clock/date display for the MarineTraffic panel
        │   ├── ngo-portal.js                 # Assignment feed, status update actions
        │   ├── refugee-portal.js             # Provisional ID lookup, rights display
        │   ├── dashboard.js                  # KPI cards, map marker stats
        │   ├── translation.js                # i18n switching (EN/HI)
        │   └── ui-components.js              # showToast(), modal helpers, shared UI utilities
        ├── pages/
        │   ├── dashboard.html                # Global KPI dashboard
        │   ├── sea-marshall.html             # Vessel management + MarineTraffic map
        │   ├── immigration.html              # Passport scan + traveler search
        │   ├── ngo-portal.html               # NGO humanitarian assignments
        │   ├── refugee-portal.html           # Refugee self-service ID lookup
        │   └── border-patrol/
        │       ├── bsf.html                  # BSF portal
        │       ├── itbp.html                 # ITBP portal
        │       ├── ssb.html                  # SSB portal
        │       ├── assam-rifles.html         # Assam Rifles portal
        │       └── cisf.html                 # CISF portal
        ├── svg/                              # Force emblems, UI icons, logo
        └── assets/translations/             # i18n JSON (en.json, hi.json, etc.)
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate and receive session data |
| `GET` | `/api/dashboard/kpis` | Aggregate KPIs: volume, flags, pending aid, open incidents |
| `GET` | `/api/dashboard/top-entry-points` | Top 8 entry points by entity count |
| `POST` | `/api/border-patrol/watchlist-check` | Check passport/name against blacklist |
| `POST` | `/api/border-patrol/register-refugee` | Register a refugee, generate Provisional ID, create NGO assignment |
| `GET` | `/api/border-patrol/refugees` | List refugee registrations (filter by force) |
| `POST` | `/api/immigration/verify-passport` | OCR scan or passport-number lookup + verification checks |
| `GET` | `/api/immigration/travelers` | Search traveler entities by name / passport / status |
| `POST` | `/api/immigration/grant-entry` | Set entity status to Verified |
| `GET` | `/api/sea-marshall/vessels` | List all vessels with live status overrides |
| `POST` | `/api/sea-marshall/lock-vessel` | Issue intercept order (status → INTERCEPTED, auto-create incident) |
| `POST` | `/api/sea-marshall/flag-vessel` | Flag vessel as suspicious (status → FLAGGED_ILLEGAL) |
| `POST` | `/api/sea-marshall/file-incident` | Create a maritime incident record |
| `POST` | `/api/sea-marshall/add-vessel` | Add a new vessel to the registry |
| `GET` | `/api/ngo/assignments` | List NGO assignments (filter by status) |
| `PATCH` | `/api/ngo/assignments/<id>/status` | Update assignment status |
| `GET` | `/api/ngo/assignments/counts` | Assignment count breakdown by status |
| `GET` | `/api/refugee/lookup/<provisional_id>` | Self-lookup by Provisional ID — returns registration + rights |
| `GET` | `/api/opensky` | Server-side proxy to OpenSky aircraft state API (OAuth2, cached token) |
| `GET` | `/api/flights` | Server-side proxy to AviationStack flights API (5-min cache) |
| `GET` | `/api/airports` | List of 30 supported Indian international airports |

---

## Why This Stack

Flask was chosen for its minimal overhead and fast iteration speed — ideal for a hackathon prototype that needs a working multi-route REST API in hours rather than days. SQLite eliminates all infrastructure setup (no Docker, no Postgres, no migrations tool) while still providing ACID compliance for concurrent reads via WAL mode. The decision to run Tesseract OCR server-side in Python avoids the complexities of WebAssembly builds and keep the client thin. Both external APIs (OpenSky and AviationStack) are proxied server-side: OpenSky requires OAuth2 client credentials that cannot be exposed client-side, and AviationStack's free tier is HTTP-only which would be blocked by mixed-content policy in the browser. Leaflet.js was chosen over Google Maps or Mapbox because it is fully open-source, has zero cost at any scale, and integrates cleanly with the custom plane-marker SVG rendering logic needed for the live aircraft overlay.

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and commit with a clear message: `git commit -m "feat: describe your change"`
3. Ensure no secrets are committed — run `git diff --cached` before pushing
4. Open a Pull Request against `main` with a description of what was changed and why

---

## License

MIT License — © 2026 Kavach Team / Megahackathon 2026.
