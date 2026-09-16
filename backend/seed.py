"""
Idempotent database seeder.
Creates:
  - Admin user (admin@lms.com)
  - GeoNode hierarchy: India → Tamil Nadu → Coimbatore
"""
import sys
import os
import uuid

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import User, GeoNode
from auth.security import get_password_hash
from config import settings


def seed():
    db = SessionLocal()
    try:
        # ── Admin User ─────────────────────────────────────────────────────
        existing_admin = db.query(User).filter(User.email == "admin@lms.com").first()
        if not existing_admin:
            admin = User(
                id=uuid.uuid4(),
                full_name="System Administrator",
                email="admin@lms.com",
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                role="ADMIN",
                is_active=True,
            )
            db.add(admin)
            print("✅ Admin user created: admin@lms.com")
        else:
            print("ℹ️  Admin user already exists — skipping.")

        # ── GeoNode: India ─────────────────────────────────────────────────
        india = db.query(GeoNode).filter(
            GeoNode.level == "COUNTRY", GeoNode.name == "India"
        ).first()
        if not india:
            india = GeoNode(
                id=uuid.uuid4(),
                parent_id=None,
                level="COUNTRY",
                name="India",
                iso_code="IN",
            )
            db.add(india)
            db.flush()  # get india.id before referencing
            print("✅ GeoNode created: India (COUNTRY)")
        else:
            print("ℹ️  India GeoNode already exists — skipping.")

        # ── GeoNode: Tamil Nadu ────────────────────────────────────────────
        tn = db.query(GeoNode).filter(
            GeoNode.level == "STATE", GeoNode.name == "Tamil Nadu"
        ).first()
        if not tn:
            tn = GeoNode(
                id=uuid.uuid4(),
                parent_id=india.id,
                level="STATE",
                name="Tamil Nadu",
                iso_code="IN-TN",
            )
            db.add(tn)
            db.flush()
            print("✅ GeoNode created: Tamil Nadu (STATE)")
        else:
            print("ℹ️  Tamil Nadu GeoNode already exists — skipping.")

        # ── GeoNode: Coimbatore ────────────────────────────────────────────
        cbe = db.query(GeoNode).filter(
            GeoNode.level == "DISTRICT", GeoNode.name == "Coimbatore"
        ).first()
        if not cbe:
            cbe = GeoNode(
                id=uuid.uuid4(),
                parent_id=tn.id,
                level="DISTRICT",
                name="Coimbatore",
            )
            db.add(cbe)
            print("✅ GeoNode created: Coimbatore (DISTRICT)")
        else:
            print("ℹ️  Coimbatore GeoNode already exists — skipping.")

        db.commit()
        print("🌱 Seeding complete.")

    except Exception as e:
        db.rollback()
        print(f"❌ Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
