# LPMS Progress Tracker

## Repository Structure
```text
.
├── backend
│   ├── alembic
│   │   ├── versions
│   │   │   └── 0001_initial_schema.py   ← NEW: Initial migration (all tables)
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── auth
│   │   ├── dependencies.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   └── security.py
│   ├── documents                        ← NEW: Documents module
│   │   ├── __init__.py
│   │   └── router.py
│   ├── geo                              ← NEW: Geo hierarchy module
│   │   ├── __init__.py
│   │   └── router.py
│   ├── plots                            ← NEW: Plots CRUD module
│   │   ├── __init__.py
│   │   ├── router.py
│   │   └── schemas.py
│   ├── alembic.ini
│   ├── config.py                        ← UPDATED: MinIO + ADMIN_PASSWORD settings
│   ├── database.py
│   ├── Dockerfile                       ← NEW
│   ├── entrypoint.sh                    ← NEW: Runs migrations + seed + uvicorn
│   ├── kml_parser.py                    ← NEW: KML → Shapely → WKT/GeoJSON parser
│   ├── main.py                          ← UPDATED: CORS + all routers mounted
│   ├── minio_client.py                  ← NEW: MinIO upload + presigned URL helper
│   ├── models.py                        ← UPDATED: landmark, lat, lon, location_name added to Plot
│   ├── requirements.txt                 ← UPDATED: minio, shapely, httpx added
│   └── seed.py                          ← NEW: Idempotent admin user + Coimbatore geo seed
├── docs
│   └── Coimbatore_plot_1.kml            ← Sample KML for testing
├── frontend
│   ├── public
│   ├── src
│   │   ├── api
│   │   │   ├── auth.js                  ← NEW
│   │   │   ├── client.js                ← NEW: Axios + JWT interceptor
│   │   │   ├── documents.js             ← NEW
│   │   │   ├── geo.js                   ← NEW
│   │   │   └── plots.js                 ← NEW
│   │   ├── assets
│   │   ├── components
│   │   │   └── Header.jsx               ← NEW: Logo + Login/Logout
│   │   ├── context
│   │   │   └── AuthContext.jsx          ← NEW: JWT auth state
│   │   ├── pages
│   │   │   ├── HomePage.jsx             ← NEW: Two-card home
│   │   │   ├── LoginPage.jsx            ← NEW: Email/password login
│   │   │   ├── ManagePage.jsx           ← NEW: Admin parcel management
│   │   │   ├── MapPage.jsx              ← NEW: Leaflet satellite map + parcel polygons + info panel
│   │   │   └── NavigatorPage.jsx        ← NEW: India → TN → Coimbatore drill-down
│   │   ├── App.css
│   │   ├── App.jsx                      ← UPDATED: react-router-dom routes
│   │   ├── index.css                    ← UPDATED: Full design system CSS
│   │   └── main.jsx
│   ├── Dockerfile                       ← NEW
│   ├── index.html                       ← UPDATED: title changed
│   ├── package.json                     ← UPDATED: axios + react-router-dom added
│   └── vite.config.js                   ← UPDATED: polling HMR + /api proxy
├── .env                                 ← NEW: env vars (not committed)
├── docker-compose.yml                   ← UPDATED: backend, frontend, minio, createbuckets services added
├── phase_plan.md
└── progress.md
```

## Tech Stack
- **Frontend:** React 19, React Router v6, Leaflet 1.9, Vite 8 (Map UI)
- **Backend:** Python, FastAPI (API Gateway & Logic)
- **Database:** PostgreSQL 15 with PostGIS (Spatial data)
- **Object Storage:** MinIO (local S3-compatible, PDF + KML files)
- **Infrastructure:** Docker Compose (all services containerized)
- **Geocoding:** OSM Nominatim (reverse geocoding, free, no key)
- **Map Tiles:** Esri World Imagery (satellite, free)

*Note: We are utilizing free-tier services initially. Phase 9 is dedicated to upgrading from these free tiers to full-scale, production-ready equivalents before the final release.*

---

## Detailed Phase Breakdown

### Phase 0: Project Setup
- **Goal:** A working skeleton that everything else builds on.
- **Detailed Features to Implement:**
  - Initialize FastAPI backend with core module folders (`ai`, `auth`, `documents`, `geo`, `plots`, `routing`, `search`).
  - Scaffold React web application via Vite.
  - Install base frontend dependencies (`leaflet`, `react-leaflet`).
  - Configure `docker-compose.yml` for PostgreSQL (with PostGIS 15-3.3 extension) and Redis.
  - Define `requirements.txt` for Python (FastAPI, SQLAlchemy, GeoAlchemy2, Pydantic, Alembic).
- **Tests to Run:** `docker-compose up` validation, basic `GET /` reachability test.
- **Exit Criteria:** A developer can launch the environment and see the API gateway respond and an empty React page render.

### Phase 1: Auth, RBAC & Core Schema
- **Goal:** Users can log in securely, and the comprehensive core data model exists.
- **Detailed Features to Implement:**
  - **Database Tables:** `users`, `geo_nodes` (recursive), `plots`, `owners` (append-only), `documents`, `document_extracts`, `ai_summaries`, `transactions`, `tax_records`, `audit_log`.
  - **Alembic:** Initialize and configure Alembic for schema migrations.
  - **Auth Module:** JWT generation/validation (`security.py`), Bcrypt password hashing.
  - **Endpoints:** `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
  - **RBAC:** FastAPI dependencies (`require_admin`, `require_editor`, `require_viewer`) checking JWT payload.
- **Tests to Run:** Unit tests for JWT issuance and expiration; middleware tests ensuring Viewers are blocked from write endpoints.
- **Exit Criteria:** Database schema is fully created in PostgreSQL. Admin can log in and retrieve access tokens.

### Phase 2: India Boundary Load (MVP Scope — simplified)
- **Goal:** Geographic hierarchy and navigation UI for Coimbatore MVP.
- **Detailed Features to Implement:**
  - **Seeding:** Idempotent script seeds India → Tamil Nadu → Coimbatore geo node hierarchy.
  - **Geo API:** `GET /geo/countries`, `GET /geo/{node_id}/children`, `GET /geo/by-name/{level}/{name}`.
  - **Frontend Navigation:** Drill-down navigator: India/Overseas → States → Districts (only TN/Coimbatore functional).
  - **Dockerized:** Backend + frontend + MinIO + DB all in docker-compose with HMR.
- **Exit Criteria:** User can navigate to Coimbatore via UI. Docker stack starts cleanly.

### Phase 3: KML Plot Ingestion (MVP Scope — simplified)
- **Goal:** Plots can be uploaded, stored, and rendered on the map.
- **Detailed Features to Implement:**
  - **Upload Endpoint:** `POST /plots` (multipart: KML + metadata + PDFs).
  - **KML Parsing:** stdlib xml.etree + Shapely → PostGIS POLYGON geometry.
  - **Plot APIs:** `GET /plots?district_id=` and `GET /plots/{id}`.
  - **Map Rendering:** Leaflet GeoJSON layers (polygon shapes, zoom-based ID/name labels, click-to-select).
  - **Satellite Map:** Esri World Imagery tiles, auto-fit to Coimbatore bounds on load.
- **Exit Criteria:** Admin uploads a KML, polygon appears on satellite map, can be clicked.

### Phase 4: Document Management (MVP Scope — simplified)
- **Goal:** FMB, Patta, and Deed documents can be attached to plots and retrieved securely.
- **Detailed Features to Implement:**
  - **MinIO:** Local S3-compatible storage for PDFs and KML files.
  - **Upload:** PDFs uploaded alongside plot creation via multipart form.
  - **Presigned URLs:** `GET /documents/{doc_id}/url` returns 1-hour presigned URL.
  - **Frontend:** Info panel with Preview (iframe) + Download buttons per document.
- **Exit Criteria:** Viewer can preview/download FMB, Patta, Deed from info panel.

### Phase 5: AI, OCR & Translation Layer
- **Goal:** AI summary and document intelligence operate seamlessly in the background.
- *(Full scope — not started)*

### Phase 6: Routing & Nearby Landmarks
- *(Full scope — not started)*

### Phase 7: Land View Editing
- *(Full scope — not started)*

### Phase 8: Unified Search
- *(Full scope — not started)*

### Phase 9: Production Services Migration
- *(Full scope — not started)*

---

## Phases Done
- Phase 0
- Phase 1
- Phase 2 (MVP scope)
- Phase 3 (MVP scope)
- Phase 4 (MVP scope)

## Phases Left
- Phase 5
- Phase 6
- Phase 7
- Phase 8
- Phase 9

## Features Implemented
### Phase 0
- Scaffolded standard React frontend using Vite (Leaflet installed).
- Configured FastAPI backend project structure and requirements.
- Configured `docker-compose.yml` for local PostgreSQL/PostGIS and Redis.
### Phase 1
- Defined SQLAlchemy models for the entire LPMS schema (geo_nodes, plots, users, etc.).
- Initialized Alembic for schema migrations.
- Implemented JWT-based authentication and RBAC dependency injection (Admin, Editor, Viewer).
### Phase 2 (MVP)
- Added backend, frontend, MinIO, and createbuckets as Docker services in docker-compose.yml.
- Backend Dockerfile + entrypoint.sh (auto-migrations + seed + uvicorn --reload).
- Frontend Dockerfile (Vite dev server with polling HMR for Docker volume mounts).
- Idempotent seed.py: creates admin@lms.com and India → Tamil Nadu → Coimbatore GeoNodes.
- Alembic initial migration (0001_initial_schema.py) for all 10 tables with PostGIS.
- Geo API module: GET /geo/countries, GET /geo/{node_id}/children, GET /geo/by-name/{level}/{name}.
- NavigatorPage: drill-down India/Overseas → States → Districts (only TN/Coimbatore functional).
- react-router-dom routing added. AuthContext with JWT localStorage management.
### Phase 3 (MVP)
- kml_parser.py: stdlib xml.etree + Shapely KML → WKT + GeoJSON extractor.
- Plots API: GET /plots?district_id, GET /plots/{id}, POST /plots (multipart + KML parsing + Nominatim geocoding), DELETE /plots/{id} (soft delete).
- Plot model updated: landmark, lat, lon, location_name fields added; boundary made nullable.
- MapPage: Leaflet satellite map (Esri World Imagery), GeoJSON polygon overlays, zoom-based ID/name labels (ID at zoom ≥14, name at zoom ≥16), click-to-select with map pan-to-fit.
- ManagePage: parcel list table, Add New Parcel modal (all fields + KML + PDF uploads), delete confirmation.
### Phase 4 (MVP)
- MinIO object storage integrated (minio_client.py).
- PDFs uploaded to MinIO at documents/{plot_id}/{DOC_TYPE}.pdf.
- Documents API: GET /documents/{doc_id}/url returns 1-hour presigned URL.
- Info panel in MapPage: LandID, Name, Area, Coordinates, Location (Nominatim), Landmark, + Preview/Download per document.
- PDF preview via iframe modal using presigned URL (native browser PDF rendering).
