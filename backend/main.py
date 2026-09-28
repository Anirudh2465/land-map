from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import router as auth_router
from geo import router as geo_router
from plots import router as plots_router
from documents import router as documents_router
from ai import router as ai_router
from routing import router as routing_router

app = FastAPI(
    title="Land Portfolio Management System (LPMS) API",
    description="API Gateway for LPMS",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://lms-fork.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
routers = [
    auth_router.router,
    geo_router.router,
    plots_router.router,
    documents_router.router,
    ai_router.router,
    routing_router.router,
]

for r in routers:
    app.include_router(r, prefix="/api")


@app.get("/")
@app.get("/api")
def read_root():
    return {"message": "LPMS API Gateway is running"}
