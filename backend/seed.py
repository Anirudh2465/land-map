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

        # ── GeoNode: UK (Overseas Example) ─────────────────────────────────
        uk = db.query(GeoNode).filter(GeoNode.level == "COUNTRY", GeoNode.name == "United Kingdom").first()
        if not uk:
            uk = GeoNode(id=uuid.uuid4(), parent_id=None, level="COUNTRY", name="United Kingdom", iso_code="GB")
            db.add(uk)
            print("✅ GeoNode created: United Kingdom (COUNTRY)")
        
        # ── GeoNode: All India States ──────────────────────────────────────
        INDIA_STATES = [
            'Tamil Nadu', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
            'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
            'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
            'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
            'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        ]
        
        tn_node = None
        for state_name in INDIA_STATES:
            state_node = db.query(GeoNode).filter(GeoNode.level == "STATE", GeoNode.name == state_name, GeoNode.parent_id == india.id).first()
            if not state_node:
                state_node = GeoNode(id=uuid.uuid4(), parent_id=india.id, level="STATE", name=state_name)
                db.add(state_node)
                db.flush()
                print(f"✅ GeoNode created: {state_name} (STATE)")
            if state_name == 'Tamil Nadu':
                tn_node = state_node

        # ── GeoNode: All TN Districts ──────────────────────────────────────
        TN_DISTRICTS = [
            'Coimbatore', 'Ariyalur', 'Chengalpattu', 'Chennai', 'Cuddalore',
            'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram',
            'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
            'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
            'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
            'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
            'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur',
            'Vellore', 'Villupuram', 'Virudhunagar',
        ]
        
        if tn_node:
            for dist_name in TN_DISTRICTS:
                dist_node = db.query(GeoNode).filter(GeoNode.level == "DISTRICT", GeoNode.name == dist_name, GeoNode.parent_id == tn_node.id).first()
                if not dist_node:
                    dist_node = GeoNode(id=uuid.uuid4(), parent_id=tn_node.id, level="DISTRICT", name=dist_name)
                    db.add(dist_node)
                    print(f"✅ GeoNode created: {dist_name} (DISTRICT)")

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
