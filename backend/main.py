from fastapi import FastAPI
from auth import router as auth_router

app = FastAPI(
    title="Land Portfolio Management System (LPMS) API",
    description="API Gateway for LPMS",
    version="1.0.0",
)

app.include_router(auth_router.router)

@app.get("/")
def read_root():
    return {"message": "LPMS API Gateway is running"}
