# Land Management System (LMS) MVP

This repository contains the MVP for the Land Management System. The platform is designed to securely manage, view, and process land parcels, offering an interactive geographical interface built over high-resolution satellite imagery.

The entire stack is containerized using Docker Compose for reproducible and straightforward deployments.

## Prerequisites

- Docker
- Docker Compose

## Setup and Installation

1. **Environment Configuration**
   Copy the sample environment file to create your active configuration:
   ```bash
   cp .env.example .env
   ```
   *(Note: The default values in `.env.example` are pre-configured for the local Docker environment and do not require modification for standard local testing.)*

2. **Start the Infrastructure**
   Build and start the full application stack in detached mode:
   ```bash
   docker compose up -d --build
   ```
   This command provisions the PostgreSQL/PostGIS database, MinIO object storage, Redis, the FastAPI backend, and the Vite React frontend. It will also automatically execute database migrations and seed the initial Coimbatore geographical data and admin user.

## Accessing the Platform

Once all containers are running, you can access the platform services at the following URLs:

- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **Backend API Docs (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **MinIO Console:** [http://localhost:9001](http://localhost:9001)

### Authentication

Log into the frontend using the default admin credentials:
- **Email:** `admin@lms.com`
- **Password:** `Admin@1234`

## Usage Guide: Adding and Viewing Parcels

To evaluate the parcel ingestion workflow, sample data has been provided in the repository. 

### 1. Registering New Parcels
1. Log into the application and navigate to **Update Records**.
2. Drill down through the hierarchy: **India** → **Tamil Nadu** → **Coimbatore**.
3. Click **+ Add New Parcel** to open the registration form.
4. Input a unique Land ID (e.g., `CB1`) and a Land Name.
5. In the **KML File** section, upload a file from the officially provided dataset in `data/provided/` (e.g., `suganya.kml`) or from the `data/samples/` directory.
6. Click the **"Autofill Details from KML"** button. The system will parse the KML file and automatically populate the exact metric Area, Latitude, and Longitude.
7. Upload the corresponding PDF documents located in `data/provided/docs/` (which contains an extensive set of official documents such as EC, Plan Approval, Building Permit, etc.) or `data/samples/docs/` into the relevant fields.
8. Submit the form. Repeat this process for the remaining sample files.

### 2. Viewing the Interactive Map
1. Navigate to the **Search Lands** page from the Home screen.
2. Drill down to **Coimbatore**.
3. The map will load and automatically fit the bounds to display the city over satellite imagery, including street and landmark labels.
4. The parcels you created will render as precise GeoJSON polygons.
5. Click on any parcel polygon to view its details, exact coordinates, and access inline previews and secure downloads for the attached FMB, Patta, and Deed documents.

## System Architecture Overview

- **Frontend:** React 19, Vite, Leaflet, React-Router
- **Backend:** Python 3.11, FastAPI, SQLAlchemy, Alembic, Shapely (KML geometry processing)
- **Database:** PostgreSQL 15 with PostGIS
- **Storage:** MinIO (S3-compatible object storage)
