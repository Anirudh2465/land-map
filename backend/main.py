from fastapi import FastAPI

app = FastAPI(
    title="Land Portfolio Management System (LPMS) API",
    description="API Gateway for LPMS",
    version="1.0.0",
)

@app.get("/")
def read_root():
    return {"message": "LPMS API Gateway is running"}
