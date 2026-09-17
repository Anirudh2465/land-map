# LPMS Progress Tracker

## Repository Structure & File Descriptions
```text
.
├── backend/                             # Python FastAPI Backend
│   ├── alembic/                         # Database Migration Tools
│   │   ├── versions/
│   │   │   └── 0001_initial_schema.py   # Initial database migration script generating all PostGIS tables
│   │   ├── env.py                       # Alembic environment setup, loads SQLAlchemy metadata
│   │   └── script.py.mako               # Template for generating new Alembic migrations
│   ├── auth/                            # Authentication Module
│   │   ├── dependencies.py              # RBAC dependencies (require_admin, require_editor, etc.)
│   │   ├── router.py                    # Endpoints for user registration and login
│   │   ├── schemas.py                   # Pydantic validation models for user data
│   │   └── security.py                  # JWT generation, validation, and password hashing (bcrypt)
│   ├── documents/                       # Document Management Module
│   │   ├── __init__.py
│   │   └── router.py                    # Endpoints for generating S3 presigned URLs for PDFs
│   ├── geo/                             # Geographical Hierarchy Module
│   │   ├── __init__.py
│   │   └── router.py                    # API for browsing Countries, States, and Districts
│   ├── plots/                           # Land Parcels / Plots Module
│   │   ├── __init__.py
│   │   ├── router.py                    # API for plot CRUD operations (creating, fetching, deleting)
│   │   └── schemas.py                   # Pydantic validation models for plot data
│   ├── alembic.ini                      # Alembic configuration file (database URL config)
│   ├── config.py                        # Centralized app configuration (env vars for DB, Auth, MinIO)
│   ├── database.py                      # SQLAlchemy engine and session initialization
│   ├── Dockerfile                       # Docker configuration to containerize the backend
│   ├── entrypoint.sh                    # Startup script: runs DB migrations, seeds data, starts Uvicorn
│   ├── kml_parser.py                    # Utility to parse raw KML files into Shapely geometries (WKT/GeoJSON)
│   ├── main.py                          # FastAPI application entry point, mounts all routers & CORS
│   ├── minio_client.py                  # Helper functions for interfacing with MinIO object storage
│   ├── models.py                        # SQLAlchemy ORM definitions for all database tables
│   ├── requirements.txt                 # Python package dependencies
│   └── seed.py                          # Idempotent script that seeds the admin user and Coimbatore hierarchy
├── data/                                # Sample Data for Testing
│   └── samples/
│       ├── Gandhipuram_Plot_B.kml       # Sample plot KML file
│       ├── Irugur_Plot_A.kml            # Sample plot KML file
│       ├── Podanur_Plot_C_Large.kml     # Sample plot KML file
│       └── docs/
│           ├── Deed_example.pdf         # Sample Deed document
│           ├── FMB_example.pdf          # Sample FMB document
│           └── Patta_example.pdf        # Sample Patta document
├── frontend/                            # React Web Application (Vite)
│   ├── public/                          # Static assets (Favicon, raw images)
│   ├── src/
│   │   ├── api/                         # Frontend API service layer
│   │   │   ├── auth.js                  # Axios calls for login/registration
│   │   │   ├── client.js                # Base Axios instance with JWT interceptors
│   │   │   ├── documents.js             # Axios calls for document presigned URLs
│   │   │   ├── geo.js                   # Axios calls for geographic hierarchy browsing
│   │   │   └── plots.js                 # Axios calls for plot retrieval and KML uploads
│   │   ├── assets/                      # Bundled static assets (Logos, vectors)
│   │   ├── components/
│   │   │   └── Header.jsx               # Navigation bar component with login/logout states
│   │   ├── context/
│   │   │   └── AuthContext.jsx          # React Context Provider managing JWT state in localStorage
│   │   ├── pages/
│   │   │   ├── HomePage.jsx             # Landing page providing routing to main application flows
│   │   │   ├── LoginPage.jsx            # User authentication screen
│   │   │   ├── ManagePage.jsx           # Admin dashboard for uploading KMLs and managing parcels
│   │   │   ├── MapPage.jsx              # Core Leaflet map interface, polygon rendering, and plot details panel
│   │   │   └── NavigatorPage.jsx        # Drill-down menu interface for selecting Regions (India -> TN -> Coimbatore)
│   │   ├── App.css                      # Global and component-specific CSS styles
│   │   ├── App.jsx                      # Main React component, configures react-router-dom routes
│   │   ├── index.css                    # Tailwind-style utility classes and fundamental design system
│   │   └── main.jsx                     # Vite entry point, mounts the React DOM tree
│   ├── Dockerfile                       # Docker configuration to serve the frontend via dev server (HMR)
│   ├── index.html                       # HTML template hosting the React application mount point
│   ├── package.json                     # NPM dependencies and scripts (react-leaflet, react-router, axios)
│   └── vite.config.js                   # Vite bundler configuration (defines API proxies and polling HMR)
├── .env.example                         # Template for environment variables needed by docker-compose
├── docker-compose.yml                   # Orchestrates full stack: DB, MinIO, Backend, Frontend
├── phase_plan.md                        # Original architectural blueprint and reference document
└── progress.md                          # Live project tracking, structure, and completed features
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
- **Detailed Features to Implement:**
  - **Background Workers:** Configure Celery tasks and Redis message broker.
  - **OCR Pipeline:** Trigger text extraction (via Google Cloud Vision/Tesseract proxy) upon document upload; save to `document_extracts`.
  - **Translation Pipeline:** Translate extracted text via API; cache results.
  - **Summarization Pipeline:** Call Claude API combining FMB, Patta, and Deed text to output structured JSON (owner, area, flags); cache in `ai_summaries`.
  - **APIs:** `POST /documents/{id}/ocr`, `POST /documents/{id}/translate`, `GET /plots/{id}/ai-summary`.
  - **Frontend UI:** "Land Info" Panel featuring extracted raw text viewer, translation language dropdown, and AI-generated summary card.
- **Tests to Run:** Celery async execution tests, API integration tests.
- **Exit Criteria:** Uploading documents automatically generates and displays OCR text and AI summaries without blocking the main UI thread.

### Phase 6: Routing & Nearby Landmarks
- **Goal:** Turn-by-turn directions and nearby points of interest (POIs) work directly on the Leaflet map.
- **Detailed Features to Implement:**
  - **OSRM Proxy:** `GET /plots/{id}/route` backend endpoint.
  - **Geocoding Proxy:** Nominatim `/geocode` proxy for string-to-address lookups.
  - **Overpass Proxy:** `GET /plots/{id}/nearby?radius=` proxy querying OSM for schools, hospitals, water bodies, and roads.
  - **Frontend UI:** Routing module prompting device Geolocation or text address input.
  - **Map Integration:** `Leaflet Routing Machine` implementation drawing route polylines and steps.
  - **Frontend UI:** "Nearby Landmarks" toggle rendering categorized pins on the map.
- **Tests to Run:** Proxy endpoint integration tests, OSRM route validity.
- **Exit Criteria:** Users can request directions from an address to a plot and view a categorized list of nearby schools/hospitals.

### Phase 7: Land View Editing
- **Goal:** Complete lifecycle management for plot metadata and ownership history.
- **Detailed Features to Implement:**
  - **Plot Updates:** `PATCH /plots/{id}` endpoint (restricted to Editor/Admin).
  - **Ownership Transfer:** `POST /plots/{id}/transfer-ownership` workflow (creates new owner, archives old owner, inserts into `transactions` table).
  - **Immutable Audit Logging:** Middleware/Triggers to record every write into `audit_log` with `payload_delta`, implementing hash-chaining (`prev_hash`, `row_hash`) for tamper-evidence.
  - **Frontend UI:** "Land View" edit mode form for plots.
  - **Frontend UI:** Ownership transfer modal and transaction history timeline.
- **Tests to Run:** Transaction rollback tests, audit log cryptographic hash continuity tests.
- **Exit Criteria:** Editors can successfully transfer plot ownership, with immediate UI reflection and a permanent, immutable audit trail.

### Phase 8: Unified Search
- **Goal:** Global, fast, explicit search across owners, regions, and properties.
- **Detailed Features to Implement:**
  - **Database Indexing:** Setup PostgreSQL `pg_trgm` extension and GIN indexes on `owner_name`, `property_name`, and `geo_nodes.name`.
  - **Search API:** `GET /search?q=` endpoint querying and ranking results across the three entities.
  - **Frontend UI:** Global top-bar search input.
  - **Frontend UI:** Typeahead autocomplete dropdown that jumps to the specific map `fitBounds()` on selection.
- **Tests to Run:** Partial string matching latency tests, SQL query profiling.
- **Exit Criteria:** Partial queries correctly resolve and navigate to plots with sub-second latency.

### Phase 9: Production Services Migration
- **Goal:** Transition from the free-tier MVPs to full-scale, scalable production services.
- **Detailed Features to Implement:**
  - Upgrade mock/local S3 to AWS S3.
  - Upgrade OCR fallbacks (Tesseract) to Google Cloud Vision / Azure Document Intelligence.
  - Implement full production API keys for Claude and Translation services.
  - Transition local database to managed cloud PostgreSQL (e.g., AWS RDS/Aurora).
- **Tests to Run:** Comprehensive end-to-end regression tests, high-concurrency load testing on vector tiles.
- **Exit Criteria:** The system handles production-level load with no rate limiting, running entirely on paid/managed cloud infrastructure.

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
