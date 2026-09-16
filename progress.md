# LPMS Progress Tracker

## Repository Structure
```text
.
├── backend
│   ├── ai
│   ├── auth
│   ├── documents
│   ├── geo
│   ├── plots
│   ├── routing
│   ├── search
│   ├── main.py
│   └── requirements.txt
├── frontend
│   └── (Vite React app)
├── docker-compose.yml
└── progress.md
```

## Tech Stack
- **Frontend:** React, Leaflet, Vite (Map UI)
- **Backend:** Python, FastAPI (API Gateway & Logic)
- **Database:** PostgreSQL with PostGIS (Spatial data)
- **Storage & AI:** Free-tier cloud services initially (e.g., local MinIO/S3 free tier, Tesseract/free OCR tier, etc.)
- **Infrastructure:** Docker Compose (local development)

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

### Phase 2: India Boundary Load
- **Goal:** The entire India geographic hierarchy (States -> Districts) renders instantly.
- **Detailed Features to Implement:**
  - **Data Ingestion:** Scripts to parse and insert Natural Earth/GADM boundaries into `geo_nodes`.
  - **Geometry LOD:** Implement PostGIS `ST_SimplifyPreserveTopology` to generate `boundary_lod1` and `boundary_lod2` for low-resolution zoom levels.
  - **Vector Tiles:** Backend API `GET /tiles/boundaries/{z}/{x}/{y}` using `ST_AsMVT` to serve Mapbox Vector Tiles.
  - **Hierarchy API:** `GET /geo-nodes?level=COUNTRY` and `GET /geo-nodes?parent_id={id}` for menu drill-downs.
  - **Frontend UI:** Global Map View, "India vs Overseas" modal, and hierarchical list drill-down (State -> District).
  - **Frontend Map:** Integrate `Leaflet.VectorGrid` to render the MVT tiles and trigger `fitBounds()` on click.
- **Tests to Run:** Tile endpoint load testing, `ST_AsMVT` query performance analysis.
- **Exit Criteria:** App cold-loads the full India state/district outline near-instantly, regions are clickable and trigger map zooms.

### Phase 3: KML Plot Ingestion & Streaming
- **Goal:** Plots can be uploaded, stored, and seamlessly rendered via dynamic streaming.
- **Detailed Features to Implement:**
  - **Upload Endpoint:** `POST /plots` (multipart upload accepting KML files + metadata).
  - **Parsing Pipeline:** GDAL/ogr2ogr integration to parse KML to PostGIS WGS84 (`SRID 4326`) polygons.
  - **Geometry Sanitization:** `ST_IsValid` checks and `ST_MakeValid` corrections.
  - **Plot Vector Tiles:** `GET /tiles/plots/{z}/{x}/{y}` endpoint with short TTL cache.
  - **Plot APIs:** `GET /plots/{id}` and `GET /plots?geo_node_id={id}`.
  - **Frontend Streaming:** Implement a GTA-style chunk manager that requests tiles in the current viewport + buffer margin, and evicts tiles out of view.
- **Tests to Run:** KML geometry parsing tests, handling of complex polygons, chunk manager memory leak testing in browser.
- **Exit Criteria:** Batch KML uploads render flawlessly at any zoom level, and panning large districts dynamically loads/unloads data.

### Phase 4: Document Management
- **Goal:** FMB, Patta, and Deed documents can be attached to plots and retrieved securely.
- **Detailed Features to Implement:**
  - **S3 Integration:** Presigned URL generation endpoints (`POST /documents/upload-url`).
  - **Document API:** `GET /plots/{id}/documents` returning presigned download links.
  - **Metadata:** Insert tracking rows into `documents` table upon successful S3 upload.
  - **Frontend UI:** Plot Details Drawer/Panel component.
  - **Frontend UI:** File uploader interface mapped to specific slots (FMB, Patta, Deed).
  - **Frontend UI:** Inline PDF/Image preview components.
- **Tests to Run:** Presigned URL expiry tests, unauthorized access prevention.
- **Exit Criteria:** Editors can attach all 3 documents to a plot; Viewers can view/download but not replace; no files are accessible via public/raw S3 URLs.

### Phase 5: AI, OCR & Translation Layer
- **Goal:** AI summary and document intelligence operate seamlessly in the background.
- **Detailed Features to Implement:**
  - **Background Workers:** Configure Celery tasks and Redis message broker.
  - **OCR Pipeline:** Trigger text extraction (via Google Cloud Vision/Tesseract proxy) upon document upload; save to `document_extracts`.
  - **Translation Pipeline:** Translate extracted text via API; cache results.
  - **Summarization Pipeline:** Call Claude API combining FMB, Patta, and Deed text to output structured JSON (owner, area, flags); cache in `ai_summaries`.
  - **APIs:** `POST /documents/{id}/ocr`, `POST /documents/{id}/translate`, `GET /plots/{id}/ai-summary`.
  - **Frontend UI:** "Land Info" Panel featuring extracted raw text viewer, translation language dropdown, and AI-generated summary card.
- **Tests to Run:** Celery async execution tests, mocking of Claude/OCR responses.
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

## Phases Left
- Phase 2
- Phase 3
- Phase 4
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
