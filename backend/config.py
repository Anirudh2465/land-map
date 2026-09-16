from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://lpms_user:lpms_password@db:5432/lpms"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week for dev

    # Admin seed
    ADMIN_PASSWORD: str = "Admin@1234"

    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "lpms_minio_user"
    MINIO_SECRET_KEY: str = "lpms_minio_password"
    MINIO_BUCKET: str = "lpms-documents"
    MINIO_SECURE: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
