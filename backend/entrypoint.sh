#!/bin/bash
set -e

echo "⏳ Waiting for PostgreSQL to be ready..."
until python -c "
import sys, os
try:
    import psycopg2
    conn = psycopg2.connect(os.environ.get('DATABASE_URL', 'postgresql://lpms_user:lpms_password@db:5432/lpms'))
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f'  Not ready: {e}', flush=True)
    sys.exit(1)
"; do
  sleep 2
done
echo "✅ PostgreSQL is ready."

echo "🔄 Running Alembic migrations..."
alembic upgrade head
echo "✅ Migrations complete."

echo "🌱 Seeding database..."
python seed.py
echo "✅ Seeding complete."

echo "🚀 Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
