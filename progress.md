# LPMS Progress Tracker

## Repository Structure
```
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

## Detailed Phase Breakdown

### Phase 0: Project Setup
- **Goal:** A working skeleton that everything else builds on.
- **Must Have:** FastAPI base structure, React + Leaflet initialized, PostgreSQL + PostGIS via Docker Compose.
- **Tests to Run:** `docker-compose up` validation, basic endpoint reachability.
- **Exit Criteria:** A developer can run `docker-compose up` and see an empty Leaflet map talking to an empty FastAPI backend.

### Phase 1: Auth, RBAC & Core Schema
- **Goal:** Users can log in, and the core data model exists.
- **Must Have:** `users` table, JWT login/logout, Role checks (Admin, Editor, Viewer), full core schema (`geo_nodes`, `plots`, `owners`, etc.), Audit log setup.
- **Tests to Run:** Unit tests for JWT validation, role checking middleware, schema instantiation checks.
- **Exit Criteria:** An Admin can log in, create an Editor and Viewer account, and role checks correctly block a Viewer from write endpoints.

### Phase 2: India Boundary Load
- **Goal:** The entire India hierarchy renders instantly.
- **Must Have:** State/district boundary load scripts, MVT tile endpoint (`ST_AsMVT`), `Leaflet.VectorGrid` frontend integration.
- **Tests to Run:** Vector tile endpoint load testing.
- **Exit Criteria:** The app cold-loads the full India state/district outline near-instantly, and regions are clickable.

### Phase 3: KML Plot Ingestion & Streaming
- **Goal:** Plots can be uploaded and rendered seamlessly via streaming.
- **Must Have:** KML upload pipeline, GDAL/PostGIS parsing, Tile cell precomputation, Vector tile streaming endpoint, frontend chunk manager.
- **Tests to Run:** Geometry validity checks (`ST_IsValid`), upload endpoint validation.
- **Exit Criteria:** Uploading a batch of real KML plots renders correctly at every zoom level without freezing the browser.

### Phase 4: Document Management
- **Goal:** FMB, Patta, and Deed documents can be attached and retrieved securely.
- **Must Have:** Presigned S3 upload/download endpoints, Plot detail panel UI.
- **Tests to Run:** Presigned URL generation and access validation.
- **Exit Criteria:** Editors can attach all 3 documents, Viewers can view/download but not replace them, and documents are never reachable via public URLs.

### Phase 5: AI, OCR & Translation Layer
- **Goal:** AI summary and document intelligence work end-to-end.
- **Must Have:** Async OCR task, Translation endpoint, Claude API summary generation, Land Info panel UI.
- **Tests to Run:** Background task execution tests, API mocking tests.
- **Exit Criteria:** For a plot with documents, AI summary and OCR text are visible and correctly cached after initial generation.

### Phase 6: Routing & Nearby Landmarks
- **Goal:** Turn-by-turn directions and POIs work on Leaflet.
- **Must Have:** OSRM/Nominatim proxies, Overpass API proxy, routing UI in frontend.
- **Tests to Run:** Proxy endpoint integration tests.
- **Exit Criteria:** Routing from a real address to a plot produces a sane route/ETA, and nearby landmarks return a reasonable, categorized list.

### Phase 7: Land View Editing
- **Goal:** The "update" side of the product is fully functional.
- **Must Have:** Edit plot metadata form, Ownership transfer workflow, transactional audit logging.
- **Tests to Run:** Database transaction integrity tests, audit log firing checks.
- **Exit Criteria:** Editors can transfer ownership of a plot and see changes immediately, while keeping prior owners in history with an audit entry.

### Phase 8: Unified Search
- **Goal:** Fast, explicit search modes work globally.
- **Must Have:** `pg_trgm` indexes on owner/property/region names, unified search endpoint, search UI.
- **Tests to Run:** Partial string matching and fuzzy search accuracy tests.
- **Exit Criteria:** Searching a partial owner name, district name, or property name reliably surfaces the correct plots within acceptable latency.

### Phase 9: Production Services Migration
- **Goal:** Transition from free-tier mockups to production-ready services.
- **Must Have:** Upgrade OCR to Google Cloud Vision/Azure, Storage to production S3 bucket, AI to paid Claude tier, Route/Search to reliable hosted options if needed.
- **Tests to Run:** Full load testing, backup and restore drills, end-to-end regression.
- **Exit Criteria:** System functions smoothly at high volume with no free-tier rate limits.

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
