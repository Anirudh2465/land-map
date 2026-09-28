#!/usr/bin/env python3
"""
Automated Plot Ingestion Script for LPMS.
Iterates through all folders in data/provided, reads manifest.json,
and registers each plot with its KML geometry and documents via the backend API.

Can be run:
  1) Inside docker: docker exec -it lpms_backend python /data/provided/seed_provided.py
  2) From host:     python data/provided/seed_provided.py
"""

import os
import sys
import json
import argparse
from pathlib import Path
import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def main():
    parser = argparse.ArgumentParser(description="Automate parcel creation in LPMS from manifests.")
    parser.add_argument("--api-url", default=os.environ.get("API_URL", "http://127.0.0.1:8000"), help="Backend API Base URL")
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@lms.com"), help="Admin user email")
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", "Admin@1234"), help="Admin user password")
    parser.add_argument("--district", default="Coimbatore", help="Target district name")
    parser.add_argument("--recreate", action="store_true", default=True, help="Re-create existing plot if Land ID is already active")
    args = parser.parse_args()

    api_url = args.api_url.rstrip("/")
    base_dir = Path(__file__).parent.resolve()

    print(f"\n=======================================================")
    print(f"🚀 LPMS Automated Plot Ingestion")
    print(f"   API URL:    {api_url}")
    print(f"   Data Dir:   {base_dir}")
    print(f"   District:   {args.district}")
    print(f"=======================================================\n")

    client = httpx.Client(base_url=api_url, timeout=60.0)

    # 1. Authenticate as Admin
    print(f"🔑 Authenticating as {args.email}...")
    try:
        login_res = client.post("/auth/login", data={"username": args.email, "password": args.password})
        if login_res.status_code != 200:
            print(f"❌ Login failed ({login_res.status_code}): {login_res.text}")
            sys.exit(1)
        token = login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        print("✅ Authentication successful.")
    except Exception as e:
        print(f"❌ Could not connect to API at {api_url}: {e}")
        sys.exit(1)

    # 2. Resolve District GeoNode ID
    print(f"\n🌍 Resolving district GeoNode for '{args.district}'...")
    geo_res = client.get(f"/geo/by-name/DISTRICT/{args.district}")
    if geo_res.status_code != 200:
        print(f"❌ Failed to find district '{args.district}' ({geo_res.status_code}): {geo_res.text}")
        sys.exit(1)
    district_node = geo_res.json()
    district_id = district_node["id"]
    print(f"✅ District resolved: {district_node['name']} (ID: {district_id})")

    # 3. Fetch existing active plots in district for deduplication
    plots_res = client.get(f"/plots?district_id={district_id}")
    existing_plots = {p["plot_number"]: p["id"] for p in plots_res.json()} if plots_res.status_code == 200 else {}

    # 4. Scan subdirectories for manifest.json
    subdirs = [d for d in base_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not subdirs:
        print(f"⚠️  No subdirectories found in {base_dir}")
        sys.exit(0)

    print(f"\n📂 Found {len(subdirs)} subdirectories to inspect:")
    for d in subdirs:
        print(f"   - {d.name}")

    created_count = 0

    for folder in subdirs:
        manifest_path = folder / "manifest.json"
        if not manifest_path.exists():
            print(f"\n⏩ Skipping {folder.name}: No manifest.json found.")
            continue

        print(f"\n-------------------------------------------------------")
        print(f"📦 Processing: {folder.name}")
        print(f"-------------------------------------------------------")

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception as e:
            print(f"❌ Failed to parse manifest.json in {folder.name}: {e}")
            continue

        meta = manifest.get("metadata", manifest)
        docs_mapping = manifest.get("documents", manifest.get("files", {}))

        land_id = meta.get("land_id")
        land_name = meta.get("land_name")
        if not land_id or not land_name:
            print(f"❌ Invalid manifest in {folder.name}: 'land_id' and 'land_name' are required.")
            continue

        # Handle existing plot with same land_id
        if land_id in existing_plots:
            if args.recreate:
                old_id = existing_plots[land_id]
                print(f"🔄 Plot with LandID '{land_id}' already exists (ID: {old_id}). Deleting old record for fresh import...")
                del_res = client.delete(f"/plots/{old_id}", headers=auth_headers)
                if del_res.status_code not in (200, 204):
                    print(f"⚠️  Warning: Delete existing returned {del_res.status_code}: {del_res.text}")
            else:
                print(f"ℹ️  Plot with LandID '{land_id}' already exists. Skipping.")
                continue

        # Check KML file
        kml_filename = docs_mapping.get("kml_file")
        if not kml_filename:
            print(f"❌ No 'kml_file' defined in manifest for {folder.name}.")
            continue

        kml_path = folder / kml_filename
        if not kml_path.exists():
            print(f"❌ KML file not found: {kml_path}")
            continue

        # Build form fields
        form_data = {
            "district_id": district_id,
            "land_id": str(land_id).strip(),
            "land_name": str(land_name).strip(),
        }

        optional_fields = ["landmark", "plot_type", "address", "year_of_registration", "owner_name"]
        for field in optional_fields:
            val = meta.get(field)
            if val is not None and str(val).strip():
                form_data[field] = str(val).strip()

        # Prepare files
        files_to_send = []
        open_file_handles = []

        try:
            # 1. KML File (Required)
            f_kml = open(kml_path, "rb")
            open_file_handles.append(f_kml)
            files_to_send.append(("kml_file", (kml_filename, f_kml, "application/vnd.google-earth.kml+xml")))

            # 2. Document Files
            doc_fields = [
                "fmb_file", "patta_file", "deed_file", "parent_document_file",
                "ec_details_file", "building_plan_file", "plan_approval_letter_file",
                "building_permit_letter_file", "property_tax_file", "aerial_photo_file",
                "dispute_details_file"
            ]

            attached_docs = []
            for doc_field in doc_fields:
                doc_filename = docs_mapping.get(doc_field)
                if doc_filename:
                    doc_path = folder / doc_filename
                    if doc_path.exists():
                        f_doc = open(doc_path, "rb")
                        open_file_handles.append(f_doc)
                        mime = "application/pdf" if doc_path.suffix.lower() == ".pdf" else "application/octet-stream"
                        files_to_send.append((doc_field, (doc_filename, f_doc, mime)))
                        attached_docs.append(f"{doc_field} ({doc_filename})")
                    else:
                        print(f"⚠️  File not found on disk for '{doc_field}': {doc_path} (skipping this doc)")

            print(f"📤 Uploading '{land_name}' [{land_id}] with {len(attached_docs)} attached documents:")
            for ad in attached_docs:
                print(f"   • {ad}")

            create_res = client.post(
                "/plots",
                data=form_data,
                files=files_to_send,
                headers=auth_headers
            )

            if create_res.status_code != 201:
                print(f"❌ Failed to create plot ({create_res.status_code}): {create_res.text}")
                continue

            plot_data = create_res.json()
            created_count += 1
            area_val = plot_data.get('area_value', 0)
            area_acres = area_val / 4046.86 if area_val else 0
            print(f"\n🎉 Successfully created plot!")
            print(f"   - UUID:       {plot_data.get('id')}")
            print(f"   - Land ID:    {plot_data.get('plot_number')}")
            print(f"   - Area:       {area_val:,.2f} sqm ({area_acres:.2f} acres)")
            print(f"   - Centroid:   Lat {plot_data.get('lat')}, Lon {plot_data.get('lon')}")
            print(f"   - Location:   {plot_data.get('location_name')}")
            print(f"   - Docs Stored:{len(plot_data.get('documents', []))} documents in MinIO")

        finally:
            for handle in open_file_handles:
                try:
                    handle.close()
                except Exception:
                    pass

    print(f"\n=======================================================")
    print(f"🏁 Ingestion Complete: {created_count} parcels created.")
    print(f"=======================================================\n")

if __name__ == "__main__":
    main()
