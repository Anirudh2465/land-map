"""
Idempotent database seeder.
Creates:
  - Admin user (admin@lms.com)
  - GeoNode hierarchy: India -> States -> All 38 Tamil Nadu Districts -> All 317 Taluks
  - Default 'Coimbatore South' village & migrates any legacy district-level plots
"""
import sys
import os
import uuid

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import User, GeoNode, Plot
from auth.security import get_password_hash
from config import settings


INDIA_STATES = [
    'Tamil Nadu', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

TN_TALUKS_BY_DISTRICT = {
    "Coimbatore": [
        "Coimbatore South",
        "Coimbatore North",
        "Perur",
        "Madukkarai",
        "Sulur",
        "Annur",
        "Mettupalayam",
        "Pollachi",
        "Kinathukadavu",
        "Valparai",
        "Anaimalai"
    ],
    "Ariyalur": [
        "Andimadam",
        "Ariyalur",
        "Sendurai",
        "Udayarpalayam"
    ],
    "Chengalpattu": [
        "Chengalpattu",
        "Cheyyur",
        "Madurantakam",
        "Pallavaram",
        "Tambaram",
        "Thiruporur",
        "Tirukalukundram",
        "Vandalur"
    ],
    "Chennai": [
        "Alandur",
        "Ambattur",
        "Aminjikarai",
        "Ayanavaram",
        "Egmore",
        "Guindy",
        "Kolathur",
        "Madhavaram",
        "Maduravoyal",
        "Mambalam",
        "Mylapore",
        "Perambur",
        "Purasawalkam",
        "Shozhinganallur",
        "Thiruvottiyur",
        "Tondiarpet",
        "Velachery"
    ],
    "Cuddalore": [
        "Bhuvanagiri",
        "Chidambaram",
        "Cuddalore",
        "Kattumannarkoil",
        "Kurinjipadi",
        "Panruti",
        "Srimushnam",
        "Titagudi",
        "Veppur",
        "Vridhachalam"
    ],
    "Dharmapuri": [
        "Dharmapuri",
        "Harur",
        "Karimangalam",
        "Nallampalli",
        "Palacode",
        "Pappireddipatty",
        "Pennagaram"
    ],
    "Dindigul": [
        "Athoor",
        "Dindigul East",
        "Dindigul West",
        "Gujiliamparai",
        "Kodaikanal",
        "Natham",
        "Nilakottai",
        "Oddenchatram",
        "Palani",
        "Vedasandur"
    ],
    "Erode": [
        "Anthiyur",
        "Bhavani",
        "Erode",
        "Gobichettipalayam",
        "Kodumudi",
        "Modakkurichi",
        "Nambiyur",
        "Perundurai",
        "Sathyamangalam",
        "Thalavadi"
    ],
    "Kallakurichi": [
        "Chinnasalem",
        "Kallakurichi",
        "Kalvarayan Hills",
        "Sankarapuram",
        "Tirukkoilur",
        "Ulundurpet",
        "Vanapuram"
    ],
    "Kanchipuram": [
        "Kancheepuram",
        "Kundrathur",
        "Sriperumbudur",
        "Uthiramerur",
        "Walajabad"
    ],
    "Kanyakumari": [
        "Agastheeswaram",
        "Kalkulam",
        "Killiyoor",
        "Thiruvattar",
        "Thovalai",
        "Vilavamcode"
    ],
    "Karur": [
        "Arvakurichi",
        "Kadavur",
        "Karur",
        "Krishnarayapuram",
        "Kulithalai",
        "Manmangalam",
        "Pugalur"
    ],
    "Krishnagiri": [
        "Anchetty",
        "Bargur",
        "Denkanikottai",
        "Hosur",
        "Krishnagiri",
        "Pochampalli",
        "Shoolagiri",
        "Uthangarai"
    ],
    "Madurai": [
        "Kalligudi",
        "Madurai East",
        "Madurai North",
        "Madurai South",
        "Madurai West",
        "Melur",
        "Peraiyur",
        "Thirupparankundram",
        "Tirumangalam",
        "Usilampatti",
        "Vadipatti"
    ],
    "Mayiladuthurai": [
        "Kuthalam",
        "Mayiladuthurai",
        "Sirkazhi",
        "Tharangambadi"
    ],
    "Nagapattinam": [
        "Kilvelur",
        "Nagapattinam",
        "Thirukkuvalai",
        "Vedaranyam"
    ],
    "Namakkal": [
        "Kolli Hills",
        "Kumarapalayam",
        "Mohanur",
        "Namakkal",
        "Paramathivelur",
        "Rasipuram",
        "Sendamangalam",
        "Thiruchencode"
    ],
    "Nilgiris": [
        "Coonoor",
        "Gudalur",
        "Kotagiri",
        "Kundah",
        "Pandalur",
        "Udhagai"
    ],
    "Perambalur": [
        "Alathur",
        "Kunnam",
        "Perambalur",
        "Veppanthattai"
    ],
    "Pudukkottai": [
        "Alangudi",
        "Aranthangi",
        "Avudaiyarkoil",
        "Gandarvakottai",
        "Illupur",
        "Karambakudi",
        "Kulathur",
        "Manamelkudi",
        "Ponnamaravathi",
        "Pudukkottai",
        "Thirumayam",
        "Viralimalai"
    ],
    "Ramanathapuram": [
        "Kadaladi",
        "Kamuthi",
        "Kilakarai",
        "Mudukulathur",
        "Paramakudi",
        "Rajasingamangalam",
        "Ramanathapuram",
        "Rameshwaram",
        "Thiruvadani"
    ],
    "Ranipet": [
        "Arakkonam",
        "Arcot",
        "Kalavai",
        "Nemili",
        "Sholinghur",
        "Walajapet"
    ],
    "Salem": [
        "Attur",
        "Edappady",
        "Gangavalli",
        "Kadayampatti",
        "Mettur",
        "Omalur",
        "Pethanaickenpalayam",
        "Salem",
        "Salem South",
        "Salem West",
        "Sankari",
        "Thalaivasal",
        "Valapady",
        "Yercaud"
    ],
    "Sivaganga": [
        "Devakottai",
        "Ilayankudi",
        "Kalaiyarkovil",
        "Karaikudi",
        "Manamadurai",
        "Singampunari",
        "Sivaganga",
        "Thiruppattur",
        "Thiruppuvanam"
    ],
    "Tenkasi": [
        "Alangulam",
        "Kadayanallur",
        "Sankarankoil",
        "Shenkottai",
        "Sivagiri",
        "Tenkasi",
        "Thiruvengadam",
        "Veerakeralampudur"
    ],
    "Thanjavur": [
        "Budalur",
        "Kumbakonam",
        "Orathanad",
        "Papanasam",
        "Pattukkottai",
        "Peravurani",
        "Thanjavur",
        "Thiruvaiyaru",
        "Thiruvidaimarudur",
        "Thiruvonam"
    ],
    "Theni": [
        "Aundipatti",
        "Bodinayakkanur",
        "Periyakulam",
        "Theni",
        "Uthamapalayam"
    ],
    "Thoothukudi": [
        "Eral",
        "Ettayapuram",
        "Kayathar",
        "Kovilpatti",
        "Ottapidaram",
        "Sattankulam",
        "Srivaikundam",
        "Thoothukudi",
        "Tiruchendur",
        "Vilathikulam"
    ],
    "Tiruchirappalli": [
        "Lalgudi",
        "Manachanallur",
        "Manapparai",
        "Marungapuri",
        "Musiri",
        "Srirangam",
        "Thiruverumbur",
        "Thottiam",
        "Thuraiyur",
        "Tiruchirappalli East",
        "Tiruchirappalli West"
    ],
    "Tirunelveli": [
        "Ambasamudram",
        "Cheranmahadevi",
        "Manur",
        "Nanguneri",
        "Palayamkottai",
        "Radhapuram",
        "Thisayanvilai",
        "Tirunelveli"
    ],
    "Tirupathur": [
        "Ambur",
        "Natarampalli",
        "Tirupathur",
        "Vaniyambadi"
    ],
    "Tiruppur": [
        "Avinashi",
        "Dharapuram",
        "Kangayam",
        "Madathukulam",
        "Palladam",
        "Tiruppur North",
        "Tiruppur South",
        "Udumalaipet",
        "Uthukkuli"
    ],
    "Tiruvallur": [
        "Avadi",
        "Gummidipoondi",
        "Pallipet",
        "Ponneri",
        "Poonamallee",
        "R.K. Pet",
        "Tiruttani",
        "Tiruvallur",
        "Uthukottai"
    ],
    "Tiruvannamalai": [
        "Arani",
        "Chengam",
        "Chetpet",
        "Cheyyar",
        "Jamunamarathoor",
        "Kalasapakkam",
        "Kilpennathur",
        "Polur",
        "Thandarampattu",
        "Tiruvannamalai",
        "Vandavasi",
        "Vembakkam"
    ],
    "Tiruvarur": [
        "Koothanallur",
        "Kudavasal",
        "Mannargudi",
        "Muthupettai",
        "Nannilam",
        "Needamangalam",
        "Thiruthuraipoondi",
        "Thiruvarur",
        "Valangaiman"
    ],
    "Vellore": [
        "Anaicut",
        "Gudiyatham",
        "K.V. Kuppam",
        "Katpadi",
        "Pernambut",
        "Vellore"
    ],
    "Villupuram": [
        "Gingee",
        "Kandacheepuram",
        "Marakkanam",
        "Melmalaiyanoor",
        "Thiruvennainallur",
        "Tindivanam",
        "Vanur",
        "Vikravandi",
        "Villupuram"
    ],
    "Virudhunagar": [
        "Aruppukkottai",
        "Kariyapatti",
        "Rajapalayam",
        "Sattur",
        "Sivakasi",
        "Srivilliputhur",
        "Tiruchuli",
        "Vembakkottai",
        "Virudhunagar",
        "Watrap"
    ]
}

TN_DISTRICTS = list(TN_TALUKS_BY_DISTRICT.keys())


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
            db.flush()
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
        existing_states = {
            s.name: s for s in db.query(GeoNode).filter(
                GeoNode.level == "STATE", GeoNode.parent_id == india.id
            ).all()
        }
        tn_node = existing_states.get("Tamil Nadu")
        created_states = 0
        for state_name in INDIA_STATES:
            state_node = existing_states.get(state_name)
            if not state_node:
                state_node = GeoNode(id=uuid.uuid4(), parent_id=india.id, level="STATE", name=state_name)
                db.add(state_node)
                existing_states[state_name] = state_node
                created_states += 1
            if state_name == "Tamil Nadu":
                tn_node = state_node
        if created_states:
            db.flush()
            print(f"✅ Created {created_states} state GeoNode(s).")

        # ── GeoNode: All 38 TN Districts ───────────────────────────────────
        district_nodes = {}
        if tn_node:
            existing_districts = {
                d.name: d for d in db.query(GeoNode).filter(
                    GeoNode.level == "DISTRICT", GeoNode.parent_id == tn_node.id
                ).all()
            }
            created_districts = 0
            for dist_name in TN_DISTRICTS:
                dist_node = existing_districts.get(dist_name)
                if not dist_node:
                    dist_node = GeoNode(id=uuid.uuid4(), parent_id=tn_node.id, level="DISTRICT", name=dist_name)
                    db.add(dist_node)
                    existing_districts[dist_name] = dist_node
                    created_districts += 1
                district_nodes[dist_name] = dist_node
            if created_districts:
                db.flush()
                print(f"✅ Created {created_districts} Tamil Nadu district GeoNode(s).")

        # ── GeoNode: All Taluks across all 38 TN Districts ─────────────────
        cbe_node = district_nodes.get("Coimbatore")
        cbe_taluk_nodes = {}
        if district_nodes:
            district_ids = [d.id for d in district_nodes.values()]
            existing_taluks = {
                (t.parent_id, t.name): t for t in db.query(GeoNode).filter(
                    GeoNode.level == "TALUK", GeoNode.parent_id.in_(district_ids)
                ).all()
            }
            created_taluks = 0
            for dist_name, taluk_list in TN_TALUKS_BY_DISTRICT.items():
                dist_node = district_nodes.get(dist_name)
                if not dist_node:
                    continue
                for taluk_name in taluk_list:
                    key = (dist_node.id, taluk_name)
                    taluk_node = existing_taluks.get(key)
                    if not taluk_node:
                        taluk_node = GeoNode(id=uuid.uuid4(), parent_id=dist_node.id, level="TALUK", name=taluk_name)
                        db.add(taluk_node)
                        existing_taluks[key] = taluk_node
                        created_taluks += 1
                    if dist_name == "Coimbatore":
                        cbe_taluk_nodes[taluk_name] = taluk_node
            if created_taluks:
                db.flush()
                print(f"✅ Created {created_taluks} Tamil Nadu taluk GeoNode(s).")
            else:
                print("ℹ️  All Tamil Nadu taluks already exist — skipping.")

        # ── Migrate legacy plots: Coimbatore district → default village ────
        if cbe_node and "Coimbatore South" in cbe_taluk_nodes:
            cbe_south_taluk = cbe_taluk_nodes["Coimbatore South"]
            default_village = db.query(GeoNode).filter(
                GeoNode.level == "VILLAGE",
                GeoNode.name == "Coimbatore South",
                GeoNode.parent_id == cbe_south_taluk.id
            ).first()
            if not default_village:
                default_village = GeoNode(
                    id=uuid.uuid4(),
                    parent_id=cbe_south_taluk.id,
                    level="VILLAGE",
                    name="Coimbatore South",
                )
                db.add(default_village)
                db.flush()
                print("✅ GeoNode created: Coimbatore South (VILLAGE — default)")

            legacy_plots = db.query(Plot).filter(Plot.geo_node_id == cbe_node.id).all()
            if legacy_plots:
                for plot in legacy_plots:
                    plot.geo_node_id = default_village.id
                print(f"🔄 Migrated {len(legacy_plots)} plot(s) from Coimbatore district → Coimbatore South village")
            else:
                print("ℹ️  No legacy district-level plots to migrate.")

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
