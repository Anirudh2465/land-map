from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import router as auth_router
from geo import router as geo_router
from plots import router as plots_router
from documents import router as documents_router
from ai import router as ai_router

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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(geo_router.router)
app.include_router(plots_router.router)
app.include_router(documents_router.router)
app.include_router(ai_router.router)


@app.get("/")
def read_root():
    return {"message": "LPMS API Gateway is running"}
