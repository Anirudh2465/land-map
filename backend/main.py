from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.exception(f"Unhandled error on {request.url.path}: {exc}")
    exc_str = str(exc)
    if "OperationalError" in type(exc).__name__ or "tenant" in exc_str or "connection" in exc_str.lower() or "translate host name" in exc_str:
        detail = "Database connection failed. Please check if your Supabase project is active and unpaused."
    else:
        detail = "An internal server error occurred."

    response = JSONResponse(status_code=500, content={"detail": detail})
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response

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
